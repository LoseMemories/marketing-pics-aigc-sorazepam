import AppKit
import Foundation
import Photos
import PhotosUI
import UniformTypeIdentifiers

@MainActor
final class PhotoLibraryCoordinator: ObservableObject {
    @Published var isPickerPresented = false
    @Published var selection: PhotosPickerItem?
    @Published private(set) var statusMessage = "等待网页连接"

    private var pendingBackendUrl: URL?
    private var pendingCompletion: ((Result<Data, HelperError>) -> Void)?
    private var isProcessing = false

    var permissionLabel: String {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .authorized: return "authorized"
        case .limited: return "limited"
        case .denied, .restricted: return "denied"
        case .notDetermined: return "notDetermined"
        @unknown default: return "denied"
        }
    }

    func requestPick(backendBaseUrl: String, completion: @escaping (Result<Data, HelperError>) -> Void) {
        guard pendingCompletion == nil else {
            completion(.failure(HelperError("PICK_IN_PROGRESS", "已有相册选择任务正在进行。", status: 409)))
            return
        }
        guard let url = URL(string: backendBaseUrl), ["http", "https"].contains(url.scheme?.lowercased()) else {
            completion(.failure(HelperError("INVALID_BACKEND_URL", "后端地址无效。", status: 400)))
            return
        }
        pendingBackendUrl = url
        pendingCompletion = completion
        selection = nil
        statusMessage = "请选择一张实况照片"
        NSApplication.shared.activate(ignoringOtherApps: true)
        isPickerPresented = true
    }

    func selectionDidChange() {
        guard let selection, !isProcessing else { return }
        isProcessing = true
        Task {
            await process(selection)
        }
    }

    func pickerDidClose() {
        guard !isPickerPresented, selection == nil, !isProcessing, pendingCompletion != nil else { return }
        finish(.failure(HelperError("PICK_CANCELLED", "已取消选择。", status: 409)))
    }

    private func process(_ item: PhotosPickerItem) async {
        defer {
            isProcessing = false
            selection = nil
        }
        do {
            let authorization = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            guard authorization == .authorized || authorization == .limited else {
                throw HelperError("PHOTO_PERMISSION_DENIED", "请在系统设置中允许相册访问。", status: 403)
            }
            guard let identifier = item.itemIdentifier else {
                throw HelperError("ASSET_IDENTIFIER_MISSING", "无法读取所选照片的系统标识。", status: 422)
            }
            guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil).firstObject else {
                throw HelperError("ASSET_NOT_FOUND", "无法从系统相册读取所选照片。", status: 404)
            }
            statusMessage = "正在导出原图与视频轨"
            let exported = try await export(asset: asset, identifier: identifier)
            defer { try? FileManager.default.removeItem(at: exported.stillUrl.deletingLastPathComponent()) }
            guard let backend = pendingBackendUrl else {
                throw HelperError("BACKEND_URL_MISSING", "后端地址已失效。")
            }
            statusMessage = "正在导入项目"
            let response = try await upload(exported, to: backend)
            statusMessage = "导入完成"
            finish(.success(response))
        } catch let error as HelperError {
            statusMessage = error.message
            finish(.failure(error))
        } catch {
            let helperError = HelperError("PHOTO_IMPORT_FAILED", "相册导入失败：\(error.localizedDescription)")
            statusMessage = helperError.message
            finish(.failure(helperError))
        }
    }

    private func export(asset: PHAsset, identifier: String) async throws -> ExportedLivePhoto {
        let resources = PHAssetResource.assetResources(for: asset)
        let still = resources.first(where: { $0.type == .fullSizePhoto })
            ?? resources.first(where: { $0.type == .photo })
        let motion = resources.first(where: { $0.type == .fullSizePairedVideo })
            ?? resources.first(where: { $0.type == .pairedVideo })
        guard let still else {
            throw HelperError("STILL_RESOURCE_MISSING", "所选资源不包含照片原片。", status: 422)
        }
        guard let motion else {
            throw HelperError("PAIRED_VIDEO_MISSING", "所选照片不是完整实况照片，缺少配对视频。", status: 422)
        }

        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent("marketing-photo-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let stillUrl = folder.appendingPathComponent(safeFilename(for: still, fallback: "photo.heic"))
        let motionUrl = folder.appendingPathComponent(safeFilename(for: motion, fallback: "motion.mov"))
        do {
            try await write(resource: still, to: stillUrl)
            try await write(resource: motion, to: motionUrl)
        } catch {
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
        return ExportedLivePhoto(stillUrl: stillUrl, motionUrl: motionUrl, assetIdentifier: identifier)
    }

    private func safeFilename(for resource: PHAssetResource, fallback: String) -> String {
        let candidate = resource.originalFilename
        let filename = URL(fileURLWithPath: candidate).lastPathComponent
        return filename.isEmpty ? fallback : filename
    }

    private func write(resource: PHAssetResource, to url: URL) async throws {
        try await withCheckedThrowingContinuation { continuation in
            let options = PHAssetResourceRequestOptions()
            options.isNetworkAccessAllowed = true
            PHAssetResourceManager.default().writeData(for: resource, toFile: url, options: options) { error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: ()) }
            }
        }
    }

    private func upload(_ exported: ExportedLivePhoto, to backend: URL) async throws -> Data {
        let boundary = "MarketingPhotoBoundary-\(UUID().uuidString)"
        var body = Data()
        body.appendMultipartField(name: "assetIdentifier", value: exported.assetIdentifier, boundary: boundary)
        try body.appendMultipartFile(name: "still", fileUrl: exported.stillUrl, boundary: boundary)
        try body.appendMultipartFile(name: "motion", fileUrl: exported.motionUrl, boundary: boundary)
        body.append("--\(boundary)--\r\n")

        var request = URLRequest(url: backend.appendingPathComponent("api/v1/live-assets/apple-pair"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        request.timeoutInterval = 180
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw HelperError("BACKEND_INVALID_RESPONSE", "项目后端返回了无效响应。")
        }
        guard (200..<300).contains(http.statusCode) else {
            if let envelope = try? JSONDecoder().decode(ApiErrorEnvelope.self, from: data) {
                throw HelperError(envelope.error.code, envelope.error.message, status: http.statusCode)
            }
            throw HelperError("BACKEND_IMPORT_FAILED", "项目后端导入失败。", status: 502)
        }
        return data
    }

    private func finish(_ result: Result<Data, HelperError>) {
        let completion = pendingCompletion
        pendingCompletion = nil
        pendingBackendUrl = nil
        isPickerPresented = false
        completion?(result)
    }
}

private extension Data {
    mutating func append(_ string: String) {
        append(string.data(using: .utf8) ?? Data())
    }

    mutating func appendMultipartField(name: String, value: String, boundary: String) {
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
        append("\(value)\r\n")
    }

    mutating func appendMultipartFile(name: String, fileUrl: URL, boundary: String) throws {
        let type = UTType(filenameExtension: fileUrl.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(fileUrl.lastPathComponent)\"\r\n")
        append("Content-Type: \(type)\r\n\r\n")
        append(try Data(contentsOf: fileUrl))
        append("\r\n")
    }
}
