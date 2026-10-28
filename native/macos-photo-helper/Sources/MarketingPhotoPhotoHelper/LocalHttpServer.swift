import Foundation
import Network

final class LocalHttpServer {
    private let coordinator: PhotoLibraryCoordinator
    private let queue = DispatchQueue(label: "com.marketingphoto.helper.http")
    private var listener: NWListener?

    init(coordinator: PhotoLibraryCoordinator) {
        self.coordinator = coordinator
    }

    func start(port: UInt16 = 48171) throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
        let listener = try NWListener(using: parameters)
        listener.newConnectionHandler = { [weak self] connection in
            self?.receive(connection)
        }
        listener.stateUpdateHandler = { state in
            if case let .failed(error) = state { NSLog("Photo helper listener failed: \(error)") }
        }
        listener.start(queue: queue)
        self.listener = listener
    }

    private func receive(_ connection: NWConnection) {
        connection.start(queue: queue)
        receiveChunk(connection, buffer: Data())
    }

    private func receiveChunk(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1_048_576) { [weak self] data, _, complete, error in
            guard let self else { return }
            var next = buffer
            if let data { next.append(data) }
            if let request = HttpRequest.parse(next) {
                self.route(request, connection: connection)
            } else if complete || error != nil || next.count > 1_048_576 {
                self.sendJson(connection, status: 400, value: ApiErrorEnvelope(error: .init(code: "INVALID_REQUEST", message: "无效的本机助手请求。")))
            } else {
                self.receiveChunk(connection, buffer: next)
            }
        }
    }

    private func route(_ request: HttpRequest, connection: NWConnection) {
        if request.method == "OPTIONS" {
            send(connection, status: 204, contentType: "text/plain", body: Data())
            return
        }
        if request.method == "GET" && request.path == "/health" {
            Task { @MainActor in
                self.sendJson(connection, status: 200, value: [
                    "status": "ok",
                    "version": "photo-helper-v1",
                    "permission": self.coordinator.permissionLabel
                ])
            }
            return
        }
        if request.method == "POST" && request.path == "/pick" {
            do {
                let payload = try JSONDecoder().decode(PickRequest.self, from: request.body)
                Task { @MainActor in
                    self.coordinator.requestPick(backendBaseUrl: payload.backendBaseUrl) { result in
                        switch result {
                        case let .success(data): self.send(connection, status: 200, contentType: "application/json", body: data)
                        case let .failure(error):
                            self.sendJson(connection, status: error.status, value: ApiErrorEnvelope(error: .init(code: error.code, message: error.message)))
                        }
                    }
                }
            } catch {
                sendJson(connection, status: 400, value: ApiErrorEnvelope(error: .init(code: "INVALID_REQUEST", message: "缺少有效的后端地址。")))
            }
            return
        }
        sendJson(connection, status: 404, value: ApiErrorEnvelope(error: .init(code: "NOT_FOUND", message: "接口不存在。")))
    }

    private func sendJson<T: Encodable>(_ connection: NWConnection, status: Int, value: T) {
        let data = (try? JSONEncoder().encode(value)) ?? Data("{}".utf8)
        send(connection, status: status, contentType: "application/json; charset=utf-8", body: data)
    }

    private func send(_ connection: NWConnection, status: Int, contentType: String, body: Data) {
        let reason = [200: "OK", 204: "No Content", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 422: "Unprocessable Entity", 500: "Internal Server Error", 502: "Bad Gateway"][status] ?? "OK"
        let headers = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: \(contentType)\r\nContent-Length: \(body.count)\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n"
        var response = Data(headers.utf8)
        response.append(body)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
}

private struct HttpRequest {
    let method: String
    let path: String
    let body: Data

    static func parse(_ data: Data) -> HttpRequest? {
        let delimiter = Data("\r\n\r\n".utf8)
        guard let headerRange = data.range(of: delimiter),
              let headerText = String(data: data[..<headerRange.lowerBound], encoding: .utf8) else { return nil }
        let lines = headerText.components(separatedBy: "\r\n")
        let first = lines.first?.split(separator: " ") ?? []
        guard first.count >= 2 else { return nil }
        let contentLength = lines.dropFirst().first(where: { $0.lowercased().hasPrefix("content-length:") })
            .flatMap { Int($0.split(separator: ":", maxSplits: 1).last?.trimmingCharacters(in: .whitespaces) ?? "0") } ?? 0
        let bodyStart = headerRange.upperBound
        guard data.count >= bodyStart + contentLength else { return nil }
        return HttpRequest(
            method: String(first[0]),
            path: String(first[1]),
            body: data.subdata(in: bodyStart..<(bodyStart + contentLength))
        )
    }
}
