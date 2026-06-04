import SwiftUI
import AVFoundation

struct ScanQRView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var error: String?
    @State private var isProcessing = false

    var body: some View {
        ZStack {
            Color.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Text("Scan QR Code")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.ink)
                    Spacer()
                    Button("Cancel") { dismiss() }
                        .font(.system(size: 15))
                        .foregroundStyle(Color.ink2)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)

                Divider().background(Color.rule)

                if let error {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 32))
                            .foregroundStyle(Color.pilotRed)
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(Color.muted)
                            .multilineTextAlignment(.center)
                    }
                    .padding(40)
                } else {
                    CameraPreview { scanned in
                        guard !isProcessing else { return }
                        isProcessing = true
                        handleScan(scanned)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(20)
                    .overlay(alignment: .bottom) {
                        if isProcessing {
                            ProgressView()
                                .tint(Color.ember)
                                .padding(.bottom, 36)
                        }
                    }

                    Text("Open Settings → Connect a device in the Pilot web app, then scan the QR code shown.")
                        .font(.caption2)
                        .foregroundStyle(Color.muted)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 24)
                }
            }
        }
    }

    private func handleScan(_ raw: String) {
        guard let data = raw.data(using: .utf8),
              let payload = try? JSONDecoder().decode(PairPayload.self, from: data),
              let serverURL = URL(string: payload.serverUrl) else {
            error = "Invalid QR code. Make sure you're scanning the Pilot pairing code."
            isProcessing = false
            return
        }
        let deviceName = UIDevice.current.name
        Task {
            do {
                let token = try await APIClient.pair(serverURL: serverURL, pairToken: payload.pairToken, deviceName: deviceName)
                appState.connect(serverURL: serverURL, token: token)
                dismiss()
            } catch {
                self.error = error.localizedDescription
                isProcessing = false
            }
        }
    }
}

struct CameraPreview: UIViewRepresentable {
    let onScan: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onScan: onScan)
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = UIColor(Color.panel)
        context.coordinator.setup(in: view)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject {
        let onScan: (String) -> Void
        nonisolated(unsafe) let session = AVCaptureSession()
        nonisolated(unsafe) var previewLayer: AVCaptureVideoPreviewLayer?
        var hasFired = false

        init(onScan: @escaping (String) -> Void) {
            self.onScan = onScan
        }

        func setup(in view: UIView) {
            Task.detached(priority: .userInitiated) { [weak self] in
                guard let self else { return }
                guard let device = AVCaptureDevice.default(for: .video),
                      let input = try? AVCaptureDeviceInput(device: device) else { return }

                let output = AVCaptureMetadataOutput()
                self.session.addInput(input)
                self.session.addOutput(output)
                output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
                output.metadataObjectTypes = [.qr]

                await MainActor.run {
                    let layer = AVCaptureVideoPreviewLayer(session: self.session)
                    layer.videoGravity = .resizeAspectFill
                    layer.frame = view.bounds
                    view.layer.addSublayer(layer)
                    self.previewLayer = layer
                }
                self.session.startRunning()
            }
        }
    }
}

extension CameraPreview.Coordinator: AVCaptureMetadataOutputObjectsDelegate {
    nonisolated func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let obj = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let str = obj.stringValue else { return }
        Task { @MainActor [weak self] in
            guard let self, !self.hasFired else { return }
            self.hasFired = true
            self.session.stopRunning()
            self.onScan(str)
        }
    }
}
