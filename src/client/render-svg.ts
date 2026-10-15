// 框架无关的 SVG 渲染函数：圆环面板 + 堆叠条 + 逐请求明细

export interface CompositionEntry {
  id: number;
  key: string;
  label: string;
  group: string;
  value: number;
  precision: string;
}

export interface GroupEntry {
  group: string;
  label: string;
  value: number;
}

const GROUP_COLORS: Record<string, string> = {
  input: '#4A90E2',
  cache: '#50C878',
  output: '#F5A623',
  reasoning: '#9B59B6',
};

const PRECISION_OPACITY: Record<string, number> = {
  exact: 1.0,
  inferred: 0.75,
  estimated: 0.55,
};

const FALLBACK_COLORS = ['#4A90E2', '#50C878', '#F5A623', '#9B59B6', '#E94B3C', '#26A69A', '#FF7043', '#7E57C2'];

export interface DonutOptions {
  size?: number;
  strokeWidth?: number;
  title?: string;
}

/** 圆环面板：按 group 占比 */
export function renderDonut(groups: GroupEntry[], options: DonutOptions = {}): string {
  const size = options.size ?? 220;
  const stroke = options.strokeWidth ?? 28;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const total = groups.reduce((a, g) => a + g.value, 0);

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">`);
  if (options.title) {
    parts.push(`<title>${escapeXml(options.title)}</title>`);
  }
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eee" stroke-width="${stroke}"/>`);

  if (total > 0) {
    let offset = 0;
    for (const g of groups) {
      const frac = g.value / total;
      const dash = frac * circumference;
      const color = GROUP_COLORS[g.group] ?? FALLBACK_COLORS[groups.indexOf(g) % FALLBACK_COLORS.length]!;
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"` +
          ` stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}"` +
          ` stroke-dashoffset="${(-offset).toFixed(2)}"` +
          ` transform="rotate(-90 ${cx} ${cy})"/>`,
      );
      offset += dash;
    }
  }

  parts.push(`<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="20" font-weight="600">${total}</text>`);
  parts.push(`<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="11" fill="#666">tokens</text>`);
  parts.push('</svg>');
  return parts.join('');
}

export interface StackedBarEntry {
  turnId: string;
  timestamp: number;
  groups: GroupEntry[];
  /** 该轮是否发生压缩 */
  compressed?: boolean;
  /** 该轮是否发生缓存失效 */
  cacheInvalidated?: boolean;
}

export interface StackedBarOptions {
  width?: number;
  height?: number;
  barGap?: number;
  maxBars?: number;
}

/** 趋势图：逐请求堆叠条，标记压缩（✂）与缓存失效（⚡） */
export function renderStackedBars(entries: StackedBarEntry[], options: StackedBarOptions = {}): string {
  const width = options.width ?? 640;
  const height = options.height ?? 200;
  const gap = options.barGap ?? 2;
  const maxBars = options.maxBars ?? 60;

  const visible = entries.slice(-maxBars);
  if (visible.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
  }

  const groups = ['input', 'cache', 'output', 'reasoning'];
  const totals = visible.map((e) => e.groups.reduce((a, g) => a + g.value, 0));
  const maxTotal = Math.max(1, ...totals);
  const barWidth = (width - gap * (visible.length - 1)) / visible.length;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`);

  for (let i = 0; i < visible.length; i++) {
    const e = visible[i]!;
    const total = totals[i]!;
    const x = i * (barWidth + gap);
    let y = height;
    for (const g of groups) {
      const entry = e.groups.find((gg) => gg.group === g);
      if (!entry || entry.value === 0) continue;
      const h = (entry.value / maxTotal) * (height - 20);
      const color = GROUP_COLORS[g] ?? '#999';
      parts.push(
        `<rect x="${x.toFixed(2)}" y="${(y - h).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" fill="${color}"/>`,
      );
      y -= h;
    }
    // 标记
    if (e.compressed) {
      parts.push(`<text x="${(x + barWidth / 2).toFixed(2)}" y="12" text-anchor="middle" font-size="10">✂</text>`);
    }
    if (e.cacheInvalidated) {
      parts.push(`<text x="${(x + barWidth / 2).toFixed(2)}" y="${height - 4}" text-anchor="middle" font-size="10">⚡</text>`);
    }
    void total;
  }

  parts.push('</svg>');
  return parts.join('');
}

export interface TurnDetailOptions {
  showPrecision?: boolean;
}

/** 逐请求明细表（HTML 字符串，宿主可插入任意容器） */
export function renderTurnTable(
  entries: CompositionEntry[],
  options: TurnDetailOptions = {},
): string {
  const rows: string[] = [];
  for (const e of entries) {
    const opacity = options.showPrecision === false ? 1 : (PRECISION_OPACITY[e.precision] ?? 1);
    const color = GROUP_COLORS[e.group] ?? '#999';
    rows.push(
      `<tr>` +
        `<td style="padding:2px 6px;">${e.id}</td>` +
        `<td style="padding:2px 6px;color:${color};opacity:${opacity};">${escapeXml(e.label)}</td>` +
        `<td style="padding:2px 6px;text-align:right;">${e.value}</td>` +
        `<td style="padding:2px 6px;color:#888;font-size:11px;">${escapeXml(e.precision)}</td>` +
        `</tr>`,
    );
  }
  return `<table style="border-collapse:collapse;font:12px system-ui;">${rows.join('')}</table>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}