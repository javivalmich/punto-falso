package es.puntostudio.puntofalso;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/* Mismo nombre que el plugin local de iOS (AudioSesion.swift) para que la web no distinga plataformas.
   En Android la sesión de audio no hace falta: `modo` no hace nada y `abrirAjustes` abre los ajustes de la app (micrófono denegado). */
@CapacitorPlugin(name = "AudioSesion")
public class AudioSesionPlugin extends Plugin {

    @PluginMethod
    public void modo(PluginCall call) {
        JSObject r = new JSObject();
        r.put("modo", call.getString("modo", "ambient"));
        call.resolve(r);
    }

    @PluginMethod
    public void abrirAjustes(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudieron abrir los ajustes", e);
        }
    }
}
