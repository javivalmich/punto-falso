import UIKit
import AVFoundation
import Capacitor

/// Sesión de audio de la app. Por defecto `.ambient`: los sonidos del juego respetan el interruptor de silencio del iPhone.
/// Mientras el walkie está abierto pasa a `.playAndRecord` (grabar y oír la voz aunque el móvil esté en silencio) y,
/// al cerrarlo, vuelve a `.ambient`. La web lo pide con `Capacitor.Plugins.AudioSesion.modo({ modo: 'walkie' | 'ambient', forzar? })`.
///
/// Solo se toca la sesión cuando hace falta: al arrancar, al abrir el walkie, al cerrarlo / soltar el micro (`forzar`) y tras una interrupción.
/// Pedir el mismo modo otra vez no hace nada. Todo ocurre en una cola propia, nunca en el hilo principal
/// (`setCategory` / `setActive` pueden bloquear y dejaban la interfaz sin respuesta).
enum AudioSesion {
    private static let cola = DispatchQueue(label: "es.puntostudio.puntofalso.audio", qos: .userInitiated)
    /// Solo se leen y escriben desde `cola`.
    private static var pedido = false          // último modo pedido (true = walkie)
    private static var aplicado: Bool? = nil   // último modo que quedó aplicado

    static func aplicar(walkie nuevo: Bool, forzar: Bool = false, fin: (() -> Void)? = nil) {
        cola.async {
            aplicarAhora(walkie: nuevo, forzar: forzar)
            fin?()
        }
    }

    /// Vuelve a dejar el modo que tocaba (tras una interrupción o un reinicio del sistema de audio).
    static func reaplicar() {
        cola.async { aplicarAhora(walkie: pedido, forzar: true) }
    }

    private static func aplicarAhora(walkie nuevo: Bool, forzar: Bool) {
        pedido = nuevo
        if !forzar && aplicado == nuevo { return }
        let s = AVAudioSession.sharedInstance()
        do {
            if nuevo {
                try s.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
            } else {
                try s.setCategory(.ambient, mode: .default, options: [])
            }
            try s.setActive(true)
            aplicado = nuevo
            NSLog("AUDIO sesión %@ ok (categoría real: %@)", nuevo ? "playAndRecord" : "ambient", s.category.rawValue)
        } catch {
            NSLog("AUDIO sesión error %@", "\(error)")
        }
    }

    static func vigilar() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { n in
            if let v = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
               AVAudioSession.InterruptionType(rawValue: v) == .ended { reaplicar() }
        }
        nc.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { _ in
            reaplicar()
        }
    }
}

@objc(AudioSesionPlugin)
public class AudioSesionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioSesionPlugin"
    public let jsName = "AudioSesion"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "modo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "abrirAjustes", returnType: CAPPluginReturnPromise)
    ]

    @objc public func modo(_ call: CAPPluginCall) {
        let walkie = call.getString("modo") == "walkie"
        let forzar = call.getBool("forzar") ?? false
        AudioSesion.aplicar(walkie: walkie, forzar: forzar) { call.resolve() }
    }

    /// Abre los ajustes de la app (Ajustes → Punto Falso), p. ej. para reactivar el micrófono si se denegó.
    @objc public func abrirAjustes(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { call.reject("sin url de ajustes"); return }
            UIApplication.shared.open(url, options: [:]) { ok in ok ? call.resolve() : call.reject("no se pudo abrir") }
        }
    }
}

/// Igual que CAPBridgeViewController, pero registra el plugin local de la sesión de audio.
class PuntoViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AudioSesionPlugin())
        NSLog("AUDIO plugin AudioSesion registrado")
    }
}
