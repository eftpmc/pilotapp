import AVFoundation
import Speech
import Combine

@MainActor
final class SpeechService: NSObject, ObservableObject {
    // MARK: - State
    @Published var isListening = false
    @Published var isPlaying = false
    @Published var transcript = ""
    @Published var permissionError: String?

    // MARK: - Voice input
    private let recognizer = SFSpeechRecognizer(locale: .current)
    private var audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    // MARK: - Voice output
    private let synthesizer = AVSpeechSynthesizer()
    private var sentenceBuffer = ""
    private var voiceOutputEnabled = true

    // Sentence boundary characters
    private let sentenceEnders: CharacterSet = [".","!","?","\n"]

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    // MARK: - Voice Input

    func startListening() async {
        let speechStatus = await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0) }
        }
        guard speechStatus == .authorized else {
            permissionError = "Speech recognition not authorized"
            return
        }

        let audioStatus = await withCheckedContinuation { cont in
            AVAudioApplication.requestRecordPermission(completionHandler: { cont.resume(returning: $0) })
        }
        guard audioStatus else {
            permissionError = "Microphone access not authorized"
            return
        }

        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .measurement, options: .duckOthers)
        try? session.setActive(true, options: .notifyOthersOnDeactivation)
        #endif

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let request = recognitionRequest else { return }
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = false

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        try? audioEngine.start()
        isListening = true
        transcript = ""

        recognitionTask = recognizer?.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            if let result {
                Task { @MainActor in
                    self.transcript = result.bestTranscription.formattedString
                }
            }
            if error != nil || (result?.isFinal ?? false) {
                Task { @MainActor in self.stopListening() }
            }
        }
    }

    func stopListening() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        isListening = false
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false)
        #endif
    }

    // MARK: - Voice Output

    func setVoiceOutput(enabled: Bool) {
        voiceOutputEnabled = enabled
        if !enabled { stopSpeaking() }
    }

    /// Feed streaming text chunk by chunk. Speaks complete sentences as they arrive.
    func feedText(_ chunk: String) {
        guard voiceOutputEnabled else { return }
        sentenceBuffer += chunk

        // Speak each complete sentence, keeping the remainder buffered
        while let range = sentenceBuffer.rangeOfCharacter(from: sentenceEnders) {
            let sentence = String(sentenceBuffer[...range.lowerBound]).trimmingCharacters(in: .whitespaces)
            sentenceBuffer = String(sentenceBuffer[sentenceBuffer.index(after: range.lowerBound)...])
            if !sentence.isEmpty {
                speak(sentence)
            }
        }
    }

    /// Flush any remaining buffered text (call when stream ends).
    func flushSpeech() {
        let remaining = sentenceBuffer.trimmingCharacters(in: .whitespaces)
        if !remaining.isEmpty { speak(remaining) }
        sentenceBuffer = ""
    }

    func stopSpeaking() {
        synthesizer.stopSpeaking(at: .immediate)
        sentenceBuffer = ""
        isPlaying = false
    }

    private func speak(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = 0.52
        utterance.pitchMultiplier = 1.0
        utterance.volume = 1.0
        synthesizer.speak(utterance)
        isPlaying = true
    }
}

// MARK: - AVSpeechSynthesizerDelegate
extension SpeechService: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            if !self.synthesizer.isSpeaking { isPlaying = false }
        }
    }
}
