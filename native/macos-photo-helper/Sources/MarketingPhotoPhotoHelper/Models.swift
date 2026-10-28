import Foundation

struct PickRequest: Decodable {
    let backendBaseUrl: String
}

struct ApiErrorEnvelope: Codable {
    struct Detail: Codable {
        let code: String
        let message: String
    }

    let error: Detail
}

struct HelperError: Error {
    let code: String
    let message: String
    let status: Int

    init(_ code: String, _ message: String, status: Int = 500) {
        self.code = code
        self.message = message
        self.status = status
    }
}

struct ExportedLivePhoto {
    let stillUrl: URL
    let motionUrl: URL
    let assetIdentifier: String
}
