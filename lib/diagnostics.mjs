/** Evita exponer URLs, credenciales o formato Markdown procedente de errores externos. */
export function safeDiagnostic(value) {
  return String(value || 'Error sin detalle')
    .replace(/(?:https?|wss?):\/\/[^\s<>\"'`]+/gi, '[URL oculta]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [oculto]')
    .replace(/\b(token|secret|password|authorization|cookie|api[-_]?key|sessionid)\b(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[oculto]')
    .replace(/[`*_~|<>]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 240);
}

