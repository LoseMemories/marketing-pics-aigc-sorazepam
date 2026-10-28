import SwiftUI
import PhotosUI

@main
struct MarketingPhotoPhotoHelperApp: App {
    @StateObject private var coordinator: PhotoLibraryCoordinator
    private let server: LocalHttpServer

    init() {
        let coordinator = PhotoLibraryCoordinator()
        _coordinator = StateObject(wrappedValue: coordinator)
        server = LocalHttpServer(coordinator: coordinator)
        do { try server.start() }
        catch { NSLog("Unable to start photo helper: \(error)") }
    }

    var body: some Scene {
        WindowGroup {
            VStack(spacing: 18) {
                Image(systemName: "livephoto")
                    .font(.system(size: 42))
                    .foregroundStyle(.green)
                Text("Marketing Photo 相册助手")
                    .font(.title2.weight(.semibold))
                Text(coordinator.statusMessage)
                    .foregroundStyle(.secondary)
                Text("保持此窗口运行，然后在网页中点击“打开系统相册”。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(minWidth: 420, minHeight: 240)
            .photosPicker(
                isPresented: $coordinator.isPickerPresented,
                selection: $coordinator.selection,
                matching: .livePhotos,
                photoLibrary: .shared()
            )
            .onChange(of: coordinator.selection) { _ in coordinator.selectionDidChange() }
            .onChange(of: coordinator.isPickerPresented) { _ in coordinator.pickerDidClose() }
        }
        .windowResizability(.contentSize)
    }
}
