/**
 * Pantalla única de la Fase 1: dibujar un polígono tocando el mapa, pedir la
 * ruta CPP al backend y pintarla con sus estadísticas.
 *
 * Toda la lógica no visual vive en src/lib (testeada): aquí solo hay estado de
 * React y render. Flujo: tocar mapa → vértices → "Calcular ruta" →
 * POST /routes/compute → LineString azul + panel de stats.
 */

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  type PressEvent,
} from "@maplibre/maplibre-react-native";
import { API_BASE_URL, INITIAL_CENTER, INITIAL_ZOOM, MAP_STYLE_URL } from "./src/config";
import { ApiError, computeRoute, type ComputedRouteDto } from "./src/lib/api";
import { addVertex, canClose, clearDraft, toGeoJsonPolygon, undoVertex, type Draft } from "./src/lib/draw";
import {
  draftLineFeature,
  draftPolygonFeature,
  formatMeters,
  formatPercent,
  routeLineFeature,
  vertexCollection,
} from "./src/lib/geojson";

export default function App() {
  const [draft, setDraft] = useState<Draft>([]);
  const [route, setRoute] = useState<ComputedRouteDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onMapPress = useCallback(
    (event: NativeSyntheticEvent<PressEvent>) => {
      if (busy || route !== null) return; // con ruta en pantalla no se dibuja
      const [lng, lat] = event.nativeEvent.lngLat;
      setError(null);
      setDraft((d) => addVertex(d, [lng, lat]));
    },
    [busy, route],
  );

  const onCompute = useCallback(async () => {
    if (!canClose(draft) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await computeRoute(toGeoJsonPolygon(draft), {
        baseUrl: API_BASE_URL,
        fetchFn: (url, init) => fetch(url, init),
      });
      setRoute(result);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }, [draft, busy]);

  const onReset = useCallback(() => {
    setDraft(clearDraft());
    setRoute(null);
    setError(null);
  }, []);

  const draftLine = draftLineFeature(draft);
  const draftFill = draftPolygonFeature(draft);
  const vertices = vertexCollection(draft);

  return (
    <View style={styles.container}>
      <MapLibreMap style={styles.map} mapStyle={MAP_STYLE_URL} onPress={onMapPress}>
        <Camera center={INITIAL_CENTER} zoom={INITIAL_ZOOM} />

        {draftFill !== null && (
          <GeoJSONSource id="draft-fill" data={draftFill}>
            <Layer type="fill" id="draft-fill-layer" paint={{ "fill-color": "#2563eb", "fill-opacity": 0.12 }} />
          </GeoJSONSource>
        )}
        {draftLine !== null && (
          <GeoJSONSource id="draft-line" data={draftLine}>
            <Layer
              type="line"
              id="draft-line-layer"
              paint={{ "line-color": "#2563eb", "line-width": 2, "line-dasharray": [2, 1] }}
            />
          </GeoJSONSource>
        )}
        {draft.length > 0 && (
          <GeoJSONSource id="draft-vertices" data={vertices}>
            <Layer
              type="circle"
              id="draft-vertices-layer"
              paint={{
                "circle-radius": 5,
                "circle-color": "#2563eb",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
              }}
            />
          </GeoJSONSource>
        )}
        {route !== null && (
          <GeoJSONSource id="route" data={routeLineFeature(route.path)}>
            <Layer
              type="line"
              id="route-layer"
              paint={{ "line-color": "#dc2626", "line-width": 4, "line-opacity": 0.85 }}
            />
          </GeoJSONSource>
        )}
      </MapLibreMap>

      <View style={styles.panel}>
        {route === null ? (
          <>
            <Text style={styles.hint}>
              {draft.length === 0
                ? "Toca el mapa para dibujar la zona a recorrer."
                : `Vértices: ${draft.length}${canClose(draft) ? "" : " (mínimo 3)"}`}
            </Text>
            {error !== null && <Text style={styles.error}>{error}</Text>}
            <View style={styles.row}>
              <Button label="Deshacer" onPress={() => setDraft(undoVertex(draft))} disabled={draft.length === 0 || busy} />
              <Button label="Limpiar" onPress={onReset} disabled={draft.length === 0 || busy} />
              <Button label="Calcular ruta" onPress={onCompute} disabled={!canClose(draft) || busy} primary />
            </View>
            {busy && (
              <View style={styles.busyRow}>
                <ActivityIndicator />
                <Text style={styles.hint}> Calculando ruta…</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={styles.statsTitle}>Ruta calculada</Text>
            <Text style={styles.stat}>
              A recorrer: {formatMeters(route.stats.routeMeters)} · Calle única:{" "}
              {formatMeters(route.stats.totalStreetMeters)}
            </Text>
            <Text style={styles.stat}>
              Repetición: {formatMeters(route.stats.repeatMeters)} ({formatPercent(route.stats.repeatPercent)}) ·{" "}
              {route.stats.streetCount} calles
            </Text>
            {route.dropped.edges.length > 0 && (
              <Text style={styles.warning}>
                ⚠ {route.dropped.edges.length} tramos aislados quedaron fuera (zona cortada por el borde).
              </Text>
            )}
            <View style={styles.row}>
              <Button label="Nueva zona" onPress={onReset} primary />
            </View>
          </>
        )}
      </View>
      <StatusBar style="auto" />
    </View>
  );
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "no_streets":
        return "Esa zona no contiene calles transitables. Prueba con otra.";
      case "overpass_failed":
        return "El servidor de mapas (Overpass) no respondió. Inténtalo en un momento.";
      case "invalid_polygon":
        return "El polígono no es válido. Dibuja al menos 3 puntos.";
      default:
        return `Error del servidor: ${err.message}`;
    }
  }
  return "No se pudo conectar con el backend. ¿Está arrancado?";
}

interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly primary?: boolean;
}

function Button({ label, onPress, disabled = false, primary = false }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, primary && styles.buttonPrimary, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  panel: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#d4d4d8",
  },
  row: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  busyRow: { flexDirection: "row", alignItems: "center" },
  hint: { color: "#52525b" },
  error: { color: "#dc2626" },
  warning: { color: "#b45309" },
  statsTitle: { fontWeight: "600", fontSize: 16 },
  stat: { color: "#27272a" },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f4f4f5",
  },
  buttonPrimary: { backgroundColor: "#2563eb" },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#27272a", fontWeight: "500" },
  buttonTextPrimary: { color: "#ffffff" },
});
