import SwiftUI

struct ConnectView: View {
    @State private var showQR = false
    @State private var showManual = false

    var body: some View {
        ZStack {
            Color.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                VStack(spacing: 8) {
                    Image(systemName: "airplane")
                        .font(.system(size: 40, weight: .light))
                        .foregroundStyle(Color.ember)
                        .padding(.bottom, 4)

                    Text("Pilot")
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundStyle(Color.ink)

                    Text("Connect to your server to get started.")
                        .font(.footnote)
                        .foregroundStyle(Color.muted)
                        .multilineTextAlignment(.center)
                }

                Spacer()

                VStack(spacing: 10) {
                    Button {
                        showQR = true
                    } label: {
                        Label("Scan QR Code", systemImage: "qrcode.viewfinder")
                            .font(.system(size: 15, weight: .medium))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.ember)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    Button {
                        showManual = true
                    } label: {
                        Text("Connect manually")
                            .font(.system(size: 14, weight: .medium))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(Color.panel)
                            .foregroundStyle(Color.ink2)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.rule, lineWidth: 1))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 48)
            }
        }
        .sheet(isPresented: $showQR) {
            ScanQRView()
        }
        .sheet(isPresented: $showManual) {
            ManualConnectView()
        }
    }
}
