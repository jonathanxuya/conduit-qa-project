// web-vitals v5 expone onCLS/onINP/onFCP/onLCP/onTTFB (getCLS/getFID ya no existen;
// FID fue reemplazado por INP). La promesa del import dinámico se maneja con .catch().
const reportWebVitals = (onPerfEntry) => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import("web-vitals")
      .then(({ onCLS, onINP, onFCP, onLCP, onTTFB }) => {
        onCLS(onPerfEntry);
        onINP(onPerfEntry);
        onFCP(onPerfEntry);
        onLCP(onPerfEntry);
        onTTFB(onPerfEntry);
      })
      .catch((error) => console.error("No se pudieron cargar las métricas web:", error));
  }
};

export default reportWebVitals;
