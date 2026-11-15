export function getPlaceholder(text = 'No Image', w = 400, h = 300, bg = '#eeeeee', fg = '#888888') {
  const safeText = String(text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><rect width='100%' height='100%' fill='${bg}'/><text x='50%' y='50%' font-family='Arial, Helvetica, sans-serif' font-size='20' fill='${fg}' dominant-baseline='middle' text-anchor='middle'>${safeText}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export default getPlaceholder;
