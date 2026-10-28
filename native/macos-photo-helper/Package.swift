// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MarketingPhotoPhotoHelper",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "MarketingPhotoPhotoHelper", targets: ["MarketingPhotoPhotoHelper"])
    ],
    targets: [
        .executableTarget(
            name: "MarketingPhotoPhotoHelper",
            linkerSettings: [
                .linkedFramework("Network"),
                .linkedFramework("Photos"),
                .linkedFramework("PhotosUI"),
                .linkedFramework("SwiftUI"),
                .linkedFramework("UniformTypeIdentifiers")
            ]
        )
    ],
    swiftLanguageVersions: [.v5]
)
