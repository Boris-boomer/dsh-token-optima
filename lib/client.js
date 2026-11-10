window.__ModuleLoader__.load({
	id: "dsh-token-optima",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_dom_client = require("react-dom/client");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/theme.ts
		const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
		const FONT_MONO = "\"SF Mono\", \"Cascadia Code\", \"JetBrains Mono\", \"Fira Code\", Consolas, monospace";
		const DARK = {
			mode: "dark",
			bg: "#0B0B0F",
			bgElevated: "#121218",
			surface: "#16161D",
			surfaceHover: "#1C1C25",
			surfaceActive: "#232330",
			border: "rgba(255,255,255,0.06)",
			borderStrong: "rgba(255,255,255,0.11)",
			divider: "rgba(255,255,255,0.04)",
			text: "#EDEDF2",
			textSecondary: "#8B8B9A",
			textTertiary: "#5A5A68",
			textInverse: "#0B0B0F",
			accent: "#8B7CF6",
			accentSoft: "rgba(139,124,246,0.14)",
			input: "#60A5FA",
			inputSoft: "rgba(96,165,250,0.14)",
			cache: "#34D399",
			cacheSoft: "rgba(52,211,153,0.14)",
			output: "#FBBF24",
			outputSoft: "rgba(251,191,36,0.14)",
			reasoning: "#F472B6",
			reasoningSoft: "rgba(244,114,182,0.14)",
			danger: "#F87171",
			dangerSoft: "rgba(248,113,113,0.14)",
			warning: "#FBBF24",
			warningSoft: "rgba(251,191,36,0.14)",
			success: "#34D399",
			successSoft: "rgba(52,211,153,0.14)",
			shadowSm: "0 1px 2px rgba(0,0,0,0.35)",
			shadowMd: "0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)",
			shadowLg: "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
			fontFamily: FONT_FAMILY,
			fontMono: FONT_MONO
		};
		const LIGHT = {
			mode: "light",
			bg: "#F7F7F9",
			bgElevated: "#FFFFFF",
			surface: "#FFFFFF",
			surfaceHover: "#F2F2F5",
			surfaceActive: "#EAEAEF",
			border: "rgba(0,0,0,0.06)",
			borderStrong: "rgba(0,0,0,0.11)",
			divider: "rgba(0,0,0,0.04)",
			text: "#14141A",
			textSecondary: "#6B6B7C",
			textTertiary: "#A0A0B0",
			textInverse: "#FFFFFF",
			accent: "#6D5DF0",
			accentSoft: "rgba(109,93,240,0.10)",
			input: "#3B82F6",
			inputSoft: "rgba(59,130,246,0.10)",
			cache: "#10B981",
			cacheSoft: "rgba(16,185,129,0.10)",
			output: "#F59E0B",
			outputSoft: "rgba(245,158,11,0.10)",
			reasoning: "#EC4899",
			reasoningSoft: "rgba(236,72,153,0.10)",
			danger: "#EF4444",
			dangerSoft: "rgba(239,68,68,0.10)",
			warning: "#F59E0B",
			warningSoft: "rgba(245,158,11,0.10)",
			success: "#10B981",
			successSoft: "rgba(16,185,129,0.10)",
			shadowSm: "0 1px 2px rgba(0,0,0,0.06)",
			shadowMd: "0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)",
			shadowLg: "0 24px 64px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.06)",
			fontFamily: FONT_FAMILY,
			fontMono: FONT_MONO
		};
		function groupColor(theme, group) {
			switch (group) {
				case "input": return theme.input;
				case "cache": return theme.cache;
				case "output": return theme.output;
				case "reasoning": return theme.reasoning;
				default: return theme.accent;
			}
		}
		//#endregion
		//#region src/client/format.ts
		function formatNumber(n) {
			if (!Number.isFinite(n)) return "0";
			const abs = Math.abs(n);
			if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
			if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
			return String(Math.round(n));
		}
		function formatCurrency(n, digits = 5) {
			if (!Number.isFinite(n)) return "$0";
			if (n > 0 && n < 1e-5) return `$${n.toExponential(2)}`;
			if (n >= 1) return `$${n.toFixed(2)}`;
			return `$${n.toFixed(digits)}`;
		}
		function formatPercent(n, digits = 1) {
			if (!Number.isFinite(n)) return "0%";
			return `${n.toFixed(digits)}%`;
		}
		function formatTime(ts) {
			try {
				const d = new Date(ts);
				return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
			} catch {
				return "";
			}
		}
		//#endregion
		//#region src/client/Composition.tsx
		const PrecisionPill = ({ theme, precision }) => {
			const cfg = precision === "exact" ? {
				label: "实测",
				color: theme.success,
				bg: theme.successSoft
			} : precision === "inferred" ? {
				label: "推断",
				color: theme.warning,
				bg: theme.warningSoft
			} : {
				label: "估算",
				color: theme.textTertiary,
				bg: theme.surfaceHover
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: {
					display: "inline-flex",
					alignItems: "center",
					padding: "2px 7px",
					borderRadius: 5,
					fontSize: 10,
					fontWeight: 500,
					color: cfg.color,
					background: cfg.bg,
					letterSpacing: "0.02em"
				},
				children: cfg.label
			});
		};
		const Composition = ({ groups, composition, theme }) => {
			const [hover, setHover] = (0, react.useState)(null);
			const total = groups.reduce((a, g) => a + g.value, 0);
			const size = 168;
			const stroke = 20;
			const center = size / 2;
			const radius = 74;
			const circumference = 2 * Math.PI * radius;
			const gapRatio = .007;
			let acc = 0;
			const segments = groups.filter((g) => g.value > 0).map((g) => {
				const frac = total > 0 ? g.value / total : 0;
				const dash = Math.max(0, frac * circumference - circumference * gapRatio);
				const offset = acc * circumference;
				acc += frac;
				return {
					group: g.group,
					label: g.label,
					value: g.value,
					pct: frac * 100,
					color: groupColor(theme, g.group),
					dash,
					offset
				};
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 20
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						position: "relative",
						width: size,
						height: size,
						flexShrink: 0
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
						width: size,
						height: size,
						viewBox: `0 0 ${size} ${size}`,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
							cx: center,
							cy: center,
							r: radius,
							fill: "none",
							stroke: theme.divider,
							strokeWidth: stroke
						}), segments.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
							cx: center,
							cy: center,
							r: radius,
							fill: "none",
							stroke: s.color,
							strokeWidth: hover === s.group ? 23 : stroke,
							strokeDasharray: `${s.dash} ${circumference - s.dash}`,
							strokeDashoffset: -s.offset,
							transform: `rotate(-90 ${center} ${center})`,
							style: {
								transition: "stroke-width 160ms ease, opacity 160ms ease",
								opacity: hover && hover !== s.group ? .35 : 1
							}
						}, s.group))]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							position: "absolute",
							inset: 0,
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							pointerEvents: "none"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 24,
								fontWeight: 600,
								letterSpacing: "-0.02em",
								fontVariantNumeric: "tabular-nums",
								lineHeight: 1
							},
							children: formatNumber(total)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 9,
								color: theme.textTertiary,
								marginTop: 5,
								textTransform: "uppercase",
								letterSpacing: "0.14em",
								fontWeight: 500
							},
							children: "tokens"
						})]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						flex: 1,
						display: "flex",
						flexDirection: "column",
						gap: 2
					},
					children: groups.map((g) => {
						const pct = total > 0 ? g.value / total * 100 : 0;
						const active = hover === g.group;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							onMouseEnter: () => setHover(g.group),
							onMouseLeave: () => setHover(null),
							style: {
								display: "flex",
								alignItems: "center",
								gap: 10,
								padding: "6px 8px",
								borderRadius: 6,
								background: active ? theme.surfaceHover : "transparent",
								transition: "background-color 130ms ease",
								cursor: "default"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
									width: 7,
									height: 7,
									borderRadius: 2,
									background: groupColor(theme, g.group),
									flexShrink: 0
								} }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										flex: 1,
										fontSize: 12.5,
										color: theme.text
									},
									children: g.label
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 12.5,
										fontWeight: 500,
										fontVariantNumeric: "tabular-nums",
										color: theme.text
									},
									children: formatNumber(g.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: 11,
										color: theme.textTertiary,
										fontVariantNumeric: "tabular-nums",
										minWidth: 42,
										textAlign: "right"
									},
									children: formatPercent(pct, 1)
								})
							]
						}, g.group);
					})
				})]
			}), composition.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: "to-details",
				style: { marginTop: 14 },
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 6,
						padding: "8px 0",
						fontSize: 12,
						color: theme.textSecondary,
						borderTop: `1px solid ${theme.divider}`
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "to-chevron",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
							width: "11",
							height: "11",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2.2",
							strokeLinecap: "round",
							strokeLinejoin: "round",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9 6l6 6-6 6" })
						})
					}), "14 类明细"]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
					style: {
						width: "100%",
						borderCollapse: "collapse",
						fontSize: 12.5
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tr", { children: [
						"#",
						"类别",
						"Tokens",
						"精度"
					].map((h, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
						style: {
							textAlign: i === 2 || i === 3 ? "right" : "left",
							padding: "8px 0 10px",
							fontSize: 10,
							fontWeight: 500,
							color: theme.textTertiary,
							textTransform: "uppercase",
							letterSpacing: "0.08em",
							width: i === 0 ? 28 : i === 3 ? 62 : void 0
						},
						children: h
					}, h)) }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: composition.map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", {
						style: { borderTop: `1px solid ${theme.divider}` },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: {
									padding: "8px 0",
									color: theme.textTertiary,
									fontFamily: theme.fontMono,
									fontSize: 10.5,
									fontVariantNumeric: "tabular-nums"
								},
								children: String(c.id).padStart(2, "0")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
								style: {
									padding: "8px 0",
									color: theme.text
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
									display: "inline-block",
									width: 6,
									height: 6,
									borderRadius: "50%",
									background: groupColor(theme, c.group),
									marginRight: 8,
									verticalAlign: "middle"
								} }), c.label]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: {
									padding: "8px 0",
									textAlign: "right",
									fontVariantNumeric: "tabular-nums",
									fontWeight: 500,
									color: theme.text
								},
								children: formatNumber(c.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								style: {
									padding: "8px 0",
									textAlign: "right"
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PrecisionPill, {
									theme,
									precision: c.precision
								})
							})
						]
					}, c.id)) })]
				})]
			})] });
		};
		//#endregion
		//#region src/client/Trend.tsx
		const ORDER = [
			"input",
			"cache",
			"output",
			"reasoning"
		];
		const Trend = ({ entries, theme }) => {
			const [hover, setHover] = (0, react.useState)(null);
			if (entries.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					color: theme.textTertiary,
					fontSize: 12,
					padding: "12px 0"
				},
				children: "暂无历史"
			});
			const width = 412;
			const height = 132;
			const paddingTop = 18;
			const chartH = 108;
			const gap = 3;
			const barW = Math.max(3, (width - gap * (entries.length - 1)) / entries.length);
			const maxTotal = Math.max(1, ...entries.map((e) => e.total));
			const gridLines = [
				.25,
				.5,
				.75,
				1
			].map((r) => ({
				y: 126 - r * chartH,
				label: formatNumber(maxTotal * r)
			}));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: { position: "relative" },
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
					width,
					height,
					viewBox: `0 0 ${width} ${height}`,
					style: {
						display: "block",
						maxWidth: "100%"
					},
					onMouseLeave: () => setHover(null),
					children: [
						gridLines.map((g, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
							x1: 0,
							x2: width,
							y1: g.y,
							y2: g.y,
							stroke: theme.divider,
							strokeDasharray: "2 4"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
							x: 0,
							y: g.y - 3,
							fontSize: "9",
							fill: theme.textTertiary,
							fontFamily: theme.fontMono,
							children: g.label
						})] }, i)),
						entries.map((e, i) => {
							const x = i * (barW + gap);
							let y = 126;
							const isHovered = hover === i;
							const opacity = hover === null || isHovered ? 1 : .4;
							const rects = [];
							for (const g of ORDER) {
								const v = e.groups[g] ?? 0;
								if (v === 0) continue;
								const h = v / maxTotal * chartH;
								rects.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
									x,
									y: y - h,
									width: barW,
									height: h,
									fill: groupColor(theme, g),
									opacity,
									rx: i === 0 ? 1 : 0
								}, g));
								y -= h;
							}
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
								onMouseEnter: () => setHover(i),
								style: { cursor: "pointer" },
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
										x,
										y: paddingTop,
										width: barW,
										height: chartH,
										fill: "transparent"
									}),
									rects,
									e.cacheInvalidated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
										cx: x + barW / 2,
										cy: 8,
										r: 2,
										fill: theme.warning,
										opacity: hover === null || isHovered ? 1 : .4
									})
								]
							}, e.turnId);
						}),
						hover !== null && entries[hover] && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
							x1: hover * (barW + gap) + barW / 2,
							x2: hover * (barW + gap) + barW / 2,
							y1: paddingTop,
							y2: 126,
							stroke: theme.borderStrong,
							strokeDasharray: "2 3",
							pointerEvents: "none"
						})
					]
				}), hover !== null && entries[hover] && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "to-tooltip",
					style: {
						left: Math.min(272, Math.max(0, hover * (barW + gap) + barW / 2 - 60)),
						top: 0
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							fontWeight: 600,
							marginBottom: 3
						},
						children: [
							"#",
							hover + 1,
							" · ",
							formatNumber(entries[hover].total),
							" tokens"
						]
					}), ORDER.map((g) => {
						const v = entries[hover].groups[g] ?? 0;
						if (v === 0) return null;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 6
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
									width: 6,
									height: 6,
									borderRadius: "50%",
									background: groupColor(theme, g)
								} }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: theme.textSecondary,
										flex: 1
									},
									children: g
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { fontVariantNumeric: "tabular-nums" },
									children: formatNumber(v)
								})
							]
						}, g);
					})]
				})]
			});
		};
		//#endregion
		//#region src/client/styles.ts
		function readInheritedFont() {
			try {
				const s = getComputedStyle(document.body);
				return {
					fontFamily: s.fontFamily || "system-ui, -apple-system, sans-serif",
					fontSize: s.fontSize || "14px",
					lineHeight: s.lineHeight && s.lineHeight !== "normal" ? s.lineHeight : "1.5"
				};
			} catch {
				return {
					fontFamily: "system-ui, -apple-system, sans-serif",
					fontSize: "14px",
					lineHeight: "1.5"
				};
			}
		}
		function detectDark() {
			try {
				const el = document.documentElement;
				let bg = getComputedStyle(document.body).backgroundColor;
				if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") bg = getComputedStyle(el).backgroundColor;
				const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
				if (!m) return true;
				return (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 < 128;
			} catch {
				return true;
			}
		}
		/** 把 Theme 映射成 CSS 变量，供全局样式表使用 */
		function themeToCssVars(t) {
			return {
				"--to-bg": t.bg,
				"--to-bg-elevated": t.bgElevated,
				"--to-surface": t.surface,
				"--to-surface-hover": t.surfaceHover,
				"--to-surface-active": t.surfaceActive,
				"--to-border": t.border,
				"--to-border-strong": t.borderStrong,
				"--to-divider": t.divider,
				"--to-text": t.text,
				"--to-text-secondary": t.textSecondary,
				"--to-text-tertiary": t.textTertiary,
				"--to-text-inverse": t.textInverse,
				"--to-accent": t.accent,
				"--to-accent-soft": t.accentSoft,
				"--to-input": t.input,
				"--to-cache": t.cache,
				"--to-output": t.output,
				"--to-reasoning": t.reasoning,
				"--to-danger": t.danger,
				"--to-warning": t.warning,
				"--to-success": t.success,
				"--to-shadow-sm": t.shadowSm,
				"--to-shadow-md": t.shadowMd,
				"--to-shadow-lg": t.shadowLg,
				"--to-font": t.fontFamily,
				"--to-font-mono": t.fontMono
			};
		}
		const STYLE_ID = "dsh-token-optima-global-style";
		let injected = false;
		function ensureGlobalStyles() {
			if (injected) return;
			if (document.getElementById(STYLE_ID)) {
				injected = true;
				return;
			}
			injected = true;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = `
@keyframes to-fade-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes to-slide-up { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
@keyframes to-scale-in { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
@keyframes to-spin { to { transform: rotate(360deg) } }
@keyframes to-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }

.dsh-to-root,
.dsh-to-root * {
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.dsh-to-root {
  font-family: var(--to-font);
  color: var(--to-text);
}

.dsh-to-root ::-webkit-scrollbar { width: 8px; height: 8px; }
.dsh-to-root ::-webkit-scrollbar-track { background: transparent; }
.dsh-to-root ::-webkit-scrollbar-thumb {
  background: var(--to-border-strong);
  border-radius: 4px;
}
.dsh-to-root ::-webkit-scrollbar-thumb:hover { background: var(--to-text-tertiary); }

.to-icon-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--to-text-secondary);
  cursor: pointer;
  padding: 0;
  transition: background-color 130ms ease, color 130ms ease, transform 90ms ease;
}
.to-icon-btn:hover { background: var(--to-surface-hover); color: var(--to-text); }
.to-icon-btn:active { transform: scale(0.94); }
.to-icon-btn:disabled { opacity: 0.32; cursor: not-allowed; }
.to-icon-btn:disabled:hover { background: transparent; color: var(--to-text-secondary); }

.to-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 7px;
  border: 1px solid var(--to-border);
  background: var(--to-surface);
  color: var(--to-text);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 130ms ease, border-color 130ms ease, transform 90ms ease;
}
.to-btn:hover { background: var(--to-surface-hover); border-color: var(--to-border-strong); }
.to-btn:active { transform: scale(0.97); }
.to-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.to-select {
  appearance: none;
  -webkit-appearance: none;
  background-color: var(--to-surface-hover);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%238B8B9A' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 5l3 3 3-3'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  background-size: 12px;
  border: 1px solid var(--to-border);
  border-radius: 7px;
  color: var(--to-text);
  padding: 5px 22px 5px 9px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  outline: none;
  transition: border-color 130ms ease, background-color 130ms ease;
  max-width: 140px;
  font-variant-numeric: tabular-nums;
}
.to-select:hover { border-color: var(--to-border-strong); }
.to-select:focus { border-color: var(--to-accent); }
.to-select option { background: var(--to-bg-elevated); color: var(--to-text); }

.to-details > summary {
  list-style: none;
  cursor: pointer;
  user-select: none;
}
.to-details > summary::-webkit-details-marker { display: none; }
.to-details > summary::marker { display: none; }
.to-details > summary .to-chevron {
  display: inline-flex;
  transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1);
}
.to-details[open] > summary .to-chevron { transform: rotate(90deg); }

.to-tooltip {
  position: absolute;
  pointer-events: none;
  padding: 5px 8px;
  background: var(--to-bg-elevated);
  border: 1px solid var(--to-border-strong);
  border-radius: 6px;
  box-shadow: var(--to-shadow-md);
  font-size: 11px;
  color: var(--to-text);
  white-space: nowrap;
  z-index: 100;
  font-variant-numeric: tabular-nums;
}
`;
			document.head.appendChild(style);
		}
		//#endregion
		//#region src/client/Icon.tsx
		function svgProps(p) {
			return {
				width: p.size ?? 16,
				height: p.size ?? 16,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: p.strokeWidth ?? 1.75,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				style: p.style,
				className: p.className
			};
		}
		/** 同心环 logo：外环 + 中环 + 中心点，语义是「缓存命中」 */
		const LogoIcon = (p) => {
			const size = p.size ?? 20;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				style: p.style,
				className: p.className,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "12",
						cy: "12",
						r: "10",
						stroke: "currentColor",
						strokeWidth: "1.4",
						opacity: "0.35"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "12",
						cy: "12",
						r: "6",
						stroke: "currentColor",
						strokeWidth: "1.9",
						opacity: "0.9"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "12",
						cy: "12",
						r: "2.3",
						fill: "currentColor"
					})
				]
			});
		};
		const CloseIcon = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			...svgProps(p),
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6 6l12 12M6 18L18 6" })
		});
		const DownloadIcon = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			...svgProps(p),
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" })
		});
		const SparkIcon = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			...svgProps(p),
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" })
		});
		const WarningIcon = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...svgProps(p),
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 3L2 20h20L12 3z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 10v4M12 17.5v.01" })]
		});
		const ZapIcon = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			...svgProps(p),
			fill: "none",
			stroke: "currentColor",
			strokeWidth: p.strokeWidth ?? 1.75,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
				fill: "currentColor",
				stroke: "none"
			})
		});
		const ShrinkIcon = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			...svgProps(p),
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 8h6V2M20 16h-6v6M4 16h6v6M20 8h-6V2" })
		});
		const ReplaceIcon = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			...svgProps(p),
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 12a9 9 0 0116-6.7M21 12a9 9 0 01-16 6.7M19 3v4h-4M5 21v-4h4" })
		});
		const WalletIcon = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...svgProps(p),
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "3",
				y: "6",
				width: "18",
				height: "14",
				rx: "2"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 10h18M16 15h2" })]
		});
		//#endregion
		//#region src/client/Panel.tsx
		function getService$1(ctx) {
			try {
				return ctx?.remote?.namespaces?.get?.("tokenOptima")?.service;
			} catch {
				return;
			}
		}
		const POS_KEY = "dsh-token-optima-panel-pos";
		function loadPos() {
			try {
				const raw = localStorage.getItem(POS_KEY);
				if (!raw) return null;
				const p = JSON.parse(raw);
				return p && typeof p.x === "number" && typeof p.y === "number" ? p : null;
			} catch {
				return null;
			}
		}
		function savePos(p) {
			try {
				localStorage.setItem(POS_KEY, JSON.stringify(p));
			} catch {}
		}
		function downloadBlob(filename, content, mime) {
			try {
				const blob = new Blob([content], { type: mime });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = filename;
				a.style.display = "none";
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				setTimeout(() => URL.revokeObjectURL(url), 1e3);
			} catch (err) {
				console.error("[dsh-token-optima] download failed:", err);
			}
		}
		const Card = ({ theme, children, style }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			style: {
				padding: "14px 16px",
				borderRadius: 12,
				background: theme.surface,
				border: `1px solid ${theme.border}`,
				...style
			},
			children
		});
		const SectionLabel = ({ theme, children, right }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				marginBottom: 10
			},
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					fontSize: 10.5,
					fontWeight: 600,
					color: theme.textTertiary,
					textTransform: "uppercase",
					letterSpacing: "0.1em"
				},
				children
			}), right]
		});
		const StatCard = ({ theme, label, value, accent, icon, sub }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				padding: "14px 15px",
				borderRadius: 11,
				background: theme.surface,
				border: `1px solid ${theme.border}`,
				position: "relative",
				overflow: "hidden"
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						position: "absolute",
						top: 12,
						right: 12,
						color: accent,
						opacity: .55,
						display: "flex"
					},
					children: icon
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: 10.5,
						color: theme.textTertiary,
						textTransform: "uppercase",
						letterSpacing: "0.09em",
						fontWeight: 600,
						marginBottom: 8
					},
					children: label
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: 22,
						fontWeight: 600,
						letterSpacing: "-0.02em",
						color: accent,
						fontVariantNumeric: "tabular-nums",
						lineHeight: 1.1
					},
					children: value
				}),
				sub && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: 11,
						color: theme.textTertiary,
						marginTop: 6
					},
					children: sub
				})
			]
		});
		const MiniMetric = ({ theme, label, primary, secondary }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: {
				padding: "10px 12px",
				borderRadius: 9,
				background: theme.bgElevated,
				border: `1px solid ${theme.border}`
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: 10,
						color: theme.textTertiary,
						textTransform: "uppercase",
						letterSpacing: "0.08em",
						fontWeight: 600,
						marginBottom: 4
					},
					children: label
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: 15,
						fontWeight: 600,
						fontVariantNumeric: "tabular-nums",
						color: theme.text,
						letterSpacing: "-0.01em"
					},
					children: primary
				}),
				secondary && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: 10.5,
						color: theme.textTertiary,
						marginTop: 2
					},
					children: secondary
				})
			]
		});
		const RiskIcon = ({ kind, size = 13 }) => {
			if (kind === "compaction") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ZapIcon, { size });
			if (kind === "shrink") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShrinkIcon, { size });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReplaceIcon, { size });
		};
		const Panel = ({ ctx, sessionId, title, dark, font, onClose, onSessionChange }) => {
			const theme = dark ? DARK : LIGHT;
			const [report, setReport] = (0, react.useState)(null);
			const [composition, setComposition] = (0, react.useState)([]);
			const [groups, setGroups] = (0, react.useState)([]);
			const [sessions, setSessions] = (0, react.useState)([]);
			const [error, setError] = (0, react.useState)(null);
			const [ready, setReady] = (0, react.useState)(false);
			const [exporting, setExporting] = (0, react.useState)(false);
			const [pos, setPos] = (0, react.useState)(() => loadPos());
			const dragRef = (0, react.useRef)(null);
			const panelRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				ensureGlobalStyles();
			}, []);
			(0, react.useEffect)(() => {
				const onMove = (e) => {
					const d = dragRef.current;
					const p = panelRef.current;
					if (!d || !p) return;
					const w = p.offsetWidth;
					const h = p.offsetHeight;
					let x = e.clientX - d.offsetX;
					let y = e.clientY - d.offsetY;
					x = Math.max(0, Math.min(x, window.innerWidth - w));
					y = Math.max(0, Math.min(y, window.innerHeight - h));
					setPos({
						x,
						y
					});
				};
				const onUp = () => {
					if (dragRef.current) setPos((prev) => {
						if (prev) savePos(prev);
						return prev;
					});
					dragRef.current = null;
				};
				document.addEventListener("mousemove", onMove);
				document.addEventListener("mouseup", onUp);
				return () => {
					document.removeEventListener("mousemove", onMove);
					document.removeEventListener("mouseup", onUp);
				};
			}, []);
			const startDrag = (e) => {
				const p = panelRef.current;
				if (!p) return;
				const rect = p.getBoundingClientRect();
				dragRef.current = {
					offsetX: e.clientX - rect.left,
					offsetY: e.clientY - rect.top
				};
				if (!pos) setPos({
					x: rect.left,
					y: rect.top
				});
				e.preventDefault();
			};
			(0, react.useEffect)(() => {
				let cancelled = false;
				let debounce = null;
				const refresh = async () => {
					const svc = getService$1(ctx);
					if (!svc) {
						if (!cancelled) setReady(false);
						return;
					}
					try {
						const sessList = await svc.listSessions();
						if (!cancelled) setSessions(sessList?.value ?? sessList);
					} catch {}
					if (!sessionId) {
						if (!cancelled) {
							setReady(true);
							setReport(null);
							setError(null);
						}
						return;
					}
					try {
						try {
							await svc.ensureSession();
						} catch {}
						const [r, c, g] = await Promise.all([
							svc.report(sessionId),
							svc.composition(sessionId),
							svc.groups(sessionId)
						]);
						if (!cancelled) {
							setReady(true);
							setReport(r?.value ?? r);
							setComposition(c?.value ?? c ?? []);
							setGroups(g?.value ?? g ?? []);
							setError(null);
						}
					} catch (err) {
						if (!cancelled) setError(err.message ?? String(err));
					}
				};
				const scheduleRefresh = () => {
					if (debounce) clearTimeout(debounce);
					debounce = setTimeout(() => {
						debounce = null;
						refresh();
					}, 280);
				};
				refresh();
				let off;
				try {
					const on = ctx?.on;
					if (typeof on === "function") {
						on.call(ctx, "tokenOptima/updated", scheduleRefresh);
						off = () => {
							const offFn = ctx?.off;
							if (typeof offFn === "function") offFn.call(ctx, "tokenOptima/updated", scheduleRefresh);
						};
					}
				} catch {}
				const t = setInterval(() => void refresh(), 1e4);
				return () => {
					cancelled = true;
					if (debounce) clearTimeout(debounce);
					clearInterval(t);
					off?.();
				};
			}, [ctx, sessionId]);
			const handleExport = async () => {
				const svc = getService$1(ctx);
				if (!svc || !sessionId || exporting) return;
				setExporting(true);
				try {
					const r = await svc.exportCsv(sessionId);
					const csv = r?.value ?? r;
					if (typeof csv !== "string" || csv.length === 0) {
						setError("导出为空");
						return;
					}
					downloadBlob(`token-optima-${sessionId.slice(-8)}-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19)}.csv`, csv, "text/csv;charset=utf-8");
				} catch (err) {
					setError(`导出失败：${err.message}`);
				} finally {
					setExporting(false);
				}
			};
			const historyList = report?.history ?? [];
			const totalCostAllTime = historyList.reduce((sum, t) => sum + (t.cost?.total ?? 0), 0);
			const totalSavedAllTime = historyList.reduce((sum, t) => sum + (t.cost?.savedByCache ?? 0), 0);
			let totalHit = 0;
			let totalMiss = 0;
			for (const t of historyList) {
				totalHit += t.cacheBlocks.hitBlocks;
				totalMiss += t.cacheBlocks.missBlocks + t.cacheBlocks.writeCandidateBlocks;
			}
			const totalBlocks = totalHit + totalMiss;
			const cacheHitRate = totalBlocks > 0 ? totalHit / totalBlocks * 100 : 0;
			const trend = historyList.slice(-30).map((t) => {
				const groupsRecord = {};
				for (const [gname, ids] of Object.entries({
					input: [
						1,
						2,
						3,
						4,
						5,
						6,
						7,
						8,
						9
					],
					cache: [
						10,
						11,
						12
					],
					output: [13],
					reasoning: [14]
				})) groupsRecord[gname] = ids.reduce((a, id) => a + (t.categories[id]?.value ?? 0), 0);
				return {
					turnId: t.turnId,
					total: Object.values(groupsRecord).reduce((a, b) => a + b, 0),
					groups: groupsRecord,
					hitBlocks: t.cacheBlocks.hitBlocks,
					missBlocks: t.cacheBlocks.missBlocks,
					writeBlocks: t.cacheBlocks.writeCandidateBlocks,
					compressed: false,
					cacheInvalidated: t.cacheEvents.length > 0
				};
			});
			const positionStyle = pos ? {
				left: pos.x,
				top: pos.y,
				right: "auto",
				bottom: "auto"
			} : {
				right: 24,
				bottom: 24
			};
			const rootStyle = {
				...themeToCssVars(theme),
				position: "fixed",
				width: 468,
				maxWidth: "calc(100vw - 32px)",
				maxHeight: "82vh",
				display: "flex",
				flexDirection: "column",
				background: theme.bg,
				color: theme.text,
				fontFamily: font.fontFamily || theme.fontFamily,
				fontSize: 13,
				lineHeight: 1.5,
				border: `1px solid ${theme.borderStrong}`,
				borderRadius: 16,
				boxShadow: theme.shadowLg,
				overflow: "hidden",
				zIndex: 99999,
				animation: "to-scale-in 220ms cubic-bezier(0.4, 0, 0.2, 1)",
				...positionStyle
			};
			const latestEffort = report?.effort?.[report.effort.length - 1] ?? null;
			const risks = (report?.cacheRisks ?? []).slice(-5).reverse();
			const drift = report?.latest?.alignmentDrift ?? 0;
			const unattributed = report?.latest?.unattributed?.value ?? 0;
			const foldFailures = report?.foldFailures ?? 0;
			const health = report?.health;
			const issues = [];
			if (health && !health.ok) for (const f of health.failures) issues.push({
				level: "error",
				text: `DSH 接口变更：${f.item}（${f.detail}）`
			});
			if (drift > .03) issues.push({
				level: "warn",
				text: `估算偏差 ${(drift * 100).toFixed(1)}% — 1-9 类为客户端估算`
			});
			if (unattributed > 0) issues.push({
				level: "warn",
				text: `未归因 ${Math.round(unattributed)} tokens`
			});
			if (foldFailures > 0) issues.push({
				level: "error",
				text: `${foldFailures} 个事件解析失败`
			});
			const cost = report?.latest?.cost;
			const shortId = sessionId ? sessionId.slice(-6) : "—";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: panelRef,
				className: "dsh-to-root",
				style: rootStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						onMouseDown: startDrag,
						style: {
							display: "flex",
							alignItems: "center",
							gap: 11,
							padding: "13px 16px",
							borderBottom: `1px solid ${theme.border}`,
							background: theme.bg,
							cursor: "grab",
							userSelect: "none",
							flexShrink: 0
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									width: 30,
									height: 30,
									borderRadius: 8,
									background: theme.accentSoft,
									color: theme.accent,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									flexShrink: 0
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LogoIcon, { size: 18 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									flex: 1,
									minWidth: 0
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										fontSize: 13.5,
										fontWeight: 600,
										letterSpacing: "-0.005em"
									},
									children: "Token Optima"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										fontSize: 11,
										color: theme.textSecondary,
										marginTop: 1,
										display: "flex",
										alignItems: "center",
										gap: 5,
										overflow: "hidden"
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												fontFamily: theme.fontMono,
												color: theme.textTertiary,
												fontSize: 10,
												letterSpacing: "0.02em"
											},
											children: ["#", shortId]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: { color: theme.textTertiary },
											children: "·"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap"
											},
											title,
											children: title || "未命名会话"
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 4
								},
								onMouseDown: (e) => e.stopPropagation(),
								children: [
									sessions.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: "to-select",
										value: sessionId,
										onChange: (e) => onSessionChange(e.target.value),
										children: [sessions.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
											value: s.sessionId,
											children: [
												s.sessionId.slice(-6),
												" · ",
												s.turns,
												"轮"
											]
										}, s.sessionId)), !sessions.some((s) => s.sessionId === sessionId) && sessionId && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
											value: sessionId,
											children: [shortId, " · 当前"]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: "to-icon-btn",
										onClick: handleExport,
										disabled: !sessionId || exporting || !report?.latest,
										title: "导出 CSV",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DownloadIcon, { size: 15 })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: "to-icon-btn",
										onClick: onClose,
										title: "关闭",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CloseIcon, { size: 15 })
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							overflowY: "auto",
							padding: "14px 16px 18px",
							display: "flex",
							flexDirection: "column",
							gap: 12
						},
						children: [
							!sessionId && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Card, {
								theme,
								style: {
									textAlign: "center",
									color: theme.textTertiary
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										fontSize: 28,
										marginBottom: 8,
										opacity: .4
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LogoIcon, { size: 32 })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: { fontSize: 13 },
									children: "等待会话激活..."
								})]
							}),
							sessionId && !ready && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Card, {
								theme,
								style: {
									textAlign: "center",
									color: theme.textTertiary
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										display: "inline-flex",
										marginBottom: 10,
										animation: "to-spin 1s linear infinite"
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LogoIcon, { size: 26 })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: { fontSize: 13 },
									children: "加载中..."
								})]
							}),
							ready && error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
								theme,
								style: {
									borderColor: theme.dangerSoft,
									background: theme.dangerSoft,
									color: theme.danger,
									fontSize: 12
								},
								children: error
							}),
							ready && !error && !report?.latest && issues.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Card, {
								theme,
								style: {
									textAlign: "center",
									color: theme.textTertiary
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										fontSize: 26,
										marginBottom: 8,
										opacity: .35
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SparkIcon, { size: 30 })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: { fontSize: 13 },
									children: "等待首次对话..."
								})]
							}),
							ready && !error && issues.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									padding: "10px 12px",
									borderRadius: 10,
									background: theme.warningSoft,
									border: `1px solid ${theme.warning}33`,
									display: "flex",
									flexDirection: "column",
									gap: 5
								},
								children: issues.map((it, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										alignItems: "flex-start",
										gap: 7,
										fontSize: 11.5,
										lineHeight: 1.5,
										color: it.level === "error" ? theme.danger : theme.warning
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											marginTop: 1,
											flexShrink: 0
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WarningIcon, { size: 12 })
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: it.text })]
								}, i))
							}),
							ready && report?.latest && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								cost && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "grid",
										gridTemplateColumns: "1fr 1fr",
										gap: 10
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCard, {
										theme,
										label: "本轮省下",
										value: formatCurrency(cost.savedByCache),
										accent: theme.cache,
										icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SparkIcon, { size: 16 }),
										sub: `累计 ${formatCurrency(totalSavedAllTime)}`
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCard, {
										theme,
										label: "本轮花费",
										value: formatCurrency(cost.total),
										accent: theme.text,
										icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WalletIcon, { size: 16 }),
										sub: `累计 ${formatCurrency(totalCostAllTime)}`
									})]
								}),
								cost && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										padding: "8px 12px",
										borderRadius: 9,
										background: theme.bgElevated,
										border: `1px solid ${theme.border}`,
										fontSize: 11,
										color: theme.textSecondary
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												display: "flex",
												alignItems: "center",
												gap: 6
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
												width: 6,
												height: 6,
												borderRadius: "50%",
												background: cost.isPeak ? theme.warning : theme.success,
												animation: "to-pulse 2s ease-in-out infinite"
											} }), cost.isPeak ? "高峰时段" : "空闲时段"]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: { fontVariantNumeric: "tabular-nums" },
											children: ["命中率 ", formatPercent(cacheHitRate, 1)]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												color: theme.textTertiary,
												fontSize: 10
											},
											children: cost.pricingVersion
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Card, {
									theme,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, {
										theme,
										children: "Token 构成"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Composition, {
										groups,
										composition,
										theme
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "grid",
										gridTemplateColumns: "1fr 1fr",
										gap: 8
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MiniMetric, {
											theme,
											label: "缓存块",
											primary: `${report.latest.cacheBlocks.hitBlocks} / ${report.latest.cacheBlocks.missBlocks + report.latest.cacheBlocks.writeCandidateBlocks}`,
											secondary: `命中 / 总计 · 写入候选 ${report.latest.cacheBlocks.writeCandidateBlocks}`
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MiniMetric, {
											theme,
											label: "推理 Token",
											primary: `${formatNumber(report.latest.reasoning.producedThisTurn)}`,
											secondary: `回传 ${formatNumber(report.latest.reasoning.replayedInInput)}`
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MiniMetric, {
											theme,
											label: "推理强度",
											primary: latestEffort ? latestEffort.decided === "unsupported" ? "不支持" : latestEffort.decided : "—",
											secondary: latestEffort && latestEffort.previous !== latestEffort.decided ? `${latestEffort.previous} → ${latestEffort.decided}` : latestEffort?.reason ?? "等待下次请求"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MiniMetric, {
											theme,
											label: "预算使用",
											primary: `${formatNumber(report.budget.usage.session)}`,
											secondary: `日 ${formatNumber(report.budget.usage.daily)} · 月 ${formatNumber(report.budget.usage.monthly)}`
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Card, {
									theme,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, {
										theme,
										right: risks.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												fontSize: 10,
												color: theme.warning,
												fontWeight: 500,
												padding: "2px 6px",
												borderRadius: 4,
												background: theme.warningSoft
											},
											children: risks.length
										}) : void 0,
										children: "缓存风险"
									}), risks.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											fontSize: 12,
											color: theme.textTertiary,
											display: "flex",
											alignItems: "center",
											gap: 7
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: { color: theme.success },
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SparkIcon, { size: 13 })
										}), "前缀完整，无失效风险"]
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											display: "flex",
											flexDirection: "column",
											gap: 6
										},
										children: risks.map((r, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "flex",
												gap: 10,
												padding: "8px 10px",
												borderRadius: 8,
												background: theme.bgElevated,
												border: `1px solid ${theme.border}`
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: {
													color: theme.warning,
													flexShrink: 0,
													marginTop: 1
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RiskIcon, {
													kind: r.kind,
													size: 14
												})
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													flex: 1,
													minWidth: 0
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: {
															display: "flex",
															alignItems: "center",
															gap: 6,
															marginBottom: 2
														},
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															style: {
																fontSize: 12,
																fontWeight: 600,
																color: theme.text
															},
															children: r.kind
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															style: {
																fontSize: 10,
																color: theme.textTertiary,
																fontFamily: theme.fontMono
															},
															children: formatTime(r.at)
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														style: {
															fontSize: 11,
															color: theme.textSecondary,
															lineHeight: 1.45
														},
														children: r.detail
													}),
													r.changedSources && r.changedSources.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														style: {
															display: "flex",
															flexWrap: "wrap",
															gap: 4,
															marginTop: 5
														},
														children: r.changedSources.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															style: {
																fontSize: 9.5,
																padding: "1px 6px",
																borderRadius: 4,
																background: theme.surfaceHover,
																color: theme.textSecondary,
																fontFamily: theme.fontMono
															},
															children: s
														}, s))
													})
												]
											})]
										}, i))
									})]
								}),
								report.latest.cacheEvents.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Card, {
									theme,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, {
										theme,
										children: "本轮缓存事件"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											display: "flex",
											flexWrap: "wrap",
											gap: 6
										},
										children: report.latest.cacheEvents.map((e, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												fontSize: 10.5,
												padding: "3px 8px",
												borderRadius: 5,
												background: theme.warningSoft,
												color: theme.warning,
												fontWeight: 500
											},
											children: [
												"⚡ ",
												e.kind,
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													style: {
														opacity: .6,
														marginLeft: 4
													},
													children: ["#", e.atChunkIndex]
												})
											]
										}, i))
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Card, {
									theme,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionLabel, {
										theme,
										right: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												fontSize: 10,
												color: theme.textTertiary
											},
											children: [
												"近 ",
												trend.length,
												" 轮"
											]
										}),
										children: "趋势"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Trend, {
										entries: trend,
										theme
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
									theme,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
										className: "to-details",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
											style: {
												display: "flex",
												alignItems: "center",
												gap: 6,
												fontSize: 11.5,
												color: theme.textSecondary,
												fontWeight: 500
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "to-chevron",
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
														width: "11",
														height: "11",
														viewBox: "0 0 24 24",
														fill: "none",
														stroke: "currentColor",
														strokeWidth: "2.2",
														strokeLinecap: "round",
														strokeLinejoin: "round",
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9 6l6 6-6 6" })
													})
												}),
												"历史轮次明细",
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													style: {
														color: theme.textTertiary,
														marginLeft: 4
													},
													children: [
														"· ",
														historyList.length,
														" 轮"
													]
												})
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: {
												maxHeight: 220,
												overflowY: "auto",
												marginTop: 10
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
												style: {
													width: "100%",
													borderCollapse: "collapse",
													fontSize: 12
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tr", { children: [
													"#",
													"花费",
													"省下",
													"命中/未中"
												].map((h, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
													style: {
														textAlign: i === 0 ? "left" : "right",
														padding: "6px 0 8px",
														fontSize: 10,
														fontWeight: 500,
														color: theme.textTertiary,
														textTransform: "uppercase",
														letterSpacing: "0.08em"
													},
													children: h
												}, h)) }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: [...historyList].reverse().map((t, idx) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", {
													style: { borderTop: `1px solid ${theme.divider}` },
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
															style: {
																padding: "7px 0",
																color: theme.textTertiary,
																fontVariantNumeric: "tabular-nums",
																fontSize: 11
															},
															children: historyList.length - idx
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
															style: {
																padding: "7px 0",
																textAlign: "right",
																fontVariantNumeric: "tabular-nums",
																color: theme.text
															},
															children: formatCurrency(t.cost?.total ?? 0)
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
															style: {
																padding: "7px 0",
																textAlign: "right",
																fontVariantNumeric: "tabular-nums",
																color: theme.cache
															},
															children: formatCurrency(t.cost?.savedByCache ?? 0)
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
															style: {
																padding: "7px 0",
																textAlign: "right",
																fontVariantNumeric: "tabular-nums",
																color: theme.textSecondary
															},
															children: [
																t.cacheBlocks.hitBlocks,
																"/",
																t.cacheBlocks.missBlocks + t.cacheBlocks.writeCandidateBlocks
															]
														})
													]
												}, t.turnId)) })]
											})
										})]
									})
								})
							] })
						]
					}),
					report?.tokenizer && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							padding: "9px 16px",
							borderTop: `1px solid ${theme.border}`,
							fontSize: 10.5,
							color: theme.textTertiary,
							background: theme.bgElevated,
							fontFamily: theme.fontMono,
							flexShrink: 0
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
								width: 5,
								height: 5,
								borderRadius: "50%",
								background: report.tokenizer.precision === "exact" ? theme.success : theme.warning
							} }), report.tokenizer.id]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: report.tokenizer.precision })]
					})
				]
			});
		};
		//#endregion
		//#region src/client/descriptors.ts
		function passthrough() {
			return {
				parse: (v) => v,
				safeParse: (v) => ({
					success: true,
					data: v
				})
			};
		}
		const TYPERT_REMOTE = {
			package: "dsh-token-optima",
			descriptors: [
				{
					id: "dsh-token-optima#tokenOptima/report",
					service: "tokenOptima",
					namespace: "tokenOptima",
					method: "report",
					invocation: { kind: "direct" },
					parameters: [{
						name: "sessionId",
						wire: "sessionId",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-token-optima#report:sessionId",
							create: passthrough
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-token-optima#report:result",
						create: passthrough
					}
				},
				{
					id: "dsh-token-optima#tokenOptima/composition",
					service: "tokenOptima",
					namespace: "tokenOptima",
					method: "composition",
					invocation: { kind: "direct" },
					parameters: [{
						name: "sessionId",
						wire: "sessionId",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-token-optima#composition:sessionId",
							create: passthrough
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-token-optima#composition:result",
						create: passthrough
					}
				},
				{
					id: "dsh-token-optima#tokenOptima/groups",
					service: "tokenOptima",
					namespace: "tokenOptima",
					method: "groups",
					invocation: { kind: "direct" },
					parameters: [{
						name: "sessionId",
						wire: "sessionId",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-token-optima#groups:sessionId",
							create: passthrough
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-token-optima#groups:result",
						create: passthrough
					}
				},
				{
					id: "dsh-token-optima#tokenOptima/listSessions",
					service: "tokenOptima",
					namespace: "tokenOptima",
					method: "listSessions",
					invocation: { kind: "direct" },
					parameters: [],
					result: {
						mode: "strict",
						typeSymbol: "dsh-token-optima#listSessions:result",
						create: passthrough
					}
				},
				{
					id: "dsh-token-optima#tokenOptima/exportCsv",
					service: "tokenOptima",
					namespace: "tokenOptima",
					method: "exportCsv",
					invocation: { kind: "direct" },
					parameters: [{
						name: "sessionId",
						wire: "sessionId",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-token-optima#exportCsv:sessionId",
							create: passthrough
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-token-optima#exportCsv:result",
						create: passthrough
					}
				},
				{
					id: "dsh-token-optima#tokenOptima/audit",
					service: "tokenOptima",
					namespace: "tokenOptima",
					method: "audit",
					invocation: { kind: "direct" },
					parameters: [{
						name: "sessionId",
						wire: "sessionId",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-token-optima#audit:sessionId",
							create: passthrough
						}
					}, {
						name: "messageId",
						wire: "messageId",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-token-optima#audit:messageId",
							create: passthrough
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-token-optima#audit:result",
						create: passthrough
					}
				},
				{
					id: "dsh-token-optima#tokenOptima/tokenizerInfo",
					service: "tokenOptima",
					namespace: "tokenOptima",
					method: "tokenizerInfo",
					invocation: { kind: "direct" },
					parameters: [],
					result: {
						mode: "strict",
						typeSymbol: "dsh-token-optima#tokenizerInfo:result",
						create: passthrough
					}
				},
				{
					id: "dsh-token-optima#tokenOptima/getEffortDecisions",
					service: "tokenOptima",
					namespace: "tokenOptima",
					method: "getEffortDecisions",
					invocation: { kind: "direct" },
					parameters: [{
						name: "sessionId",
						wire: "sessionId",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-token-optima#getEffortDecisions:sessionId",
							create: passthrough
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-token-optima#getEffortDecisions:result",
						create: passthrough
					}
				},
				{
					id: "dsh-token-optima#tokenOptima/getCacheRisks",
					service: "tokenOptima",
					namespace: "tokenOptima",
					method: "getCacheRisks",
					invocation: { kind: "direct" },
					parameters: [{
						name: "sessionId",
						wire: "sessionId",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-token-optima#getCacheRisks:sessionId",
							create: passthrough
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-token-optima#getCacheRisks:result",
						create: passthrough
					}
				},
				{
					id: "dsh-token-optima#tokenOptima/ensureSession",
					service: "tokenOptima",
					namespace: "tokenOptima",
					method: "ensureSession",
					invocation: { kind: "direct" },
					parameters: [],
					result: {
						mode: "strict",
						typeSymbol: "dsh-token-optima#ensureSession:result",
						create: passthrough
					}
				},
				{
					id: "dsh-token-optima#tokenOptima/debugEventCount",
					service: "tokenOptima",
					namespace: "tokenOptima",
					method: "debugEventCount",
					invocation: { kind: "direct" },
					parameters: [],
					result: {
						mode: "strict",
						typeSymbol: "dsh-token-optima#debugEventCount:result",
						create: passthrough
					}
				},
				{
					id: "dsh-token-optima#tokenOptima/debugLastEvents",
					service: "tokenOptima",
					namespace: "tokenOptima",
					method: "debugLastEvents",
					invocation: { kind: "direct" },
					parameters: [],
					result: {
						mode: "strict",
						typeSymbol: "dsh-token-optima#debugLastEvents:result",
						create: passthrough
					}
				}
			]
		};
		//#endregion
		//#region src/client/index.tsx
		const inject = ["remote"];
		function getService(ctx) {
			try {
				return ctx?.remote?.namespaces?.get?.("tokenOptima")?.service;
			} catch {
				return;
			}
		}
		function getSessionSvc(ctx) {
			try {
				return ctx?.remote?.namespaces?.get?.("session")?.service;
			} catch {
				return;
			}
		}
		const FloatingButton = ({ dark, onClick }) => {
			const theme = dark ? DARK : LIGHT;
			const [hover, setHover] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				onClick,
				onMouseEnter: () => setHover(true),
				onMouseLeave: () => setHover(false),
				title: "Token Optima",
				style: {
					position: "fixed",
					right: 24,
					bottom: 24,
					width: 52,
					height: 52,
					borderRadius: 16,
					border: "none",
					padding: 0,
					background: dark ? `linear-gradient(140deg, ${theme.surface} 0%, ${theme.bgElevated} 100%)` : `linear-gradient(140deg, #FFFFFF 0%, ${theme.surfaceHover} 100%)`,
					color: theme.accent,
					cursor: "pointer",
					boxShadow: hover ? `0 12px 32px ${theme.accent}40, 0 0 0 1px ${theme.borderStrong}, inset 0 1px 0 rgba(255,255,255,${dark ? "0.06" : "0.9"})` : `0 6px 20px rgba(0,0,0,${dark ? "0.5" : "0.12"}), 0 0 0 1px ${theme.border}`,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					zIndex: 99998,
					transform: hover ? "translateY(-2px) scale(1.04)" : "translateY(0) scale(1)",
					transition: "transform 200ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 200ms ease",
					fontFamily: theme.fontFamily
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
					position: "absolute",
					inset: 1,
					borderRadius: 15,
					background: hover ? theme.accentSoft : "transparent",
					transition: "background 200ms ease",
					pointerEvents: "none"
				} }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LogoIcon, { size: 24 })]
			});
		};
		const Root = ({ ctx }) => {
			const [open, setOpen] = (0, react.useState)(false);
			const [hostSessionId, setHostSessionId] = (0, react.useState)("");
			const [fetchSessionId, setFetchSessionId] = (0, react.useState)("");
			const [manualSessionId, setManualSessionId] = (0, react.useState)("");
			const [titles, setTitles] = (0, react.useState)({});
			const [dark, setDark] = (0, react.useState)(() => detectDark());
			const [font, setFont] = (0, react.useState)(() => readInheritedFont());
			const [hasGridIcon, setHasGridIcon] = (0, react.useState)(false);
			const activeSessionId = manualSessionId || hostSessionId || fetchSessionId;
			(0, react.useEffect)(() => {
				ensureGlobalStyles();
			}, []);
			(0, react.useEffect)(() => {
				const checkGrid = () => {
					const registry = window.__dshIconRegistry;
					setHasGridIcon(Array.isArray(registry) && registry.some((e) => e.id === "token-optima"));
				};
				checkGrid();
				const observer = new MutationObserver(checkGrid);
				observer.observe(document.body, {
					childList: true,
					subtree: true
				});
				const t = setInterval(checkGrid, 3e4);
				return () => {
					observer.disconnect();
					clearInterval(t);
				};
			}, []);
			(0, react.useEffect)(() => {
				const update = () => {
					setDark(detectDark());
					const f = readInheritedFont();
					setFont((prev) => prev.fontFamily === f.fontFamily && prev.fontSize === f.fontSize && prev.lineHeight === f.lineHeight ? prev : f);
				};
				update();
				const observer = new MutationObserver(update);
				observer.observe(document.documentElement, {
					attributes: true,
					attributeFilter: [
						"class",
						"style",
						"data-theme"
					]
				});
				observer.observe(document.body, {
					attributes: true,
					attributeFilter: [
						"class",
						"style",
						"data-theme"
					]
				});
				const media = window.matchMedia("(prefers-color-scheme: dark)");
				media.addEventListener?.("change", update);
				const t = setInterval(update, 1500);
				return () => {
					observer.disconnect();
					media.removeEventListener?.("change", update);
					clearInterval(t);
				};
			}, []);
			(0, react.useEffect)(() => {
				let cancelled = false;
				const refresh = async () => {
					const svc = getService(ctx);
					if (!svc) return;
					try {
						const r = await svc.report("");
						const v = r?.value ?? r;
						if (cancelled) return;
						const id = v?.currentSessionId ?? "";
						if (id) setHostSessionId((prev) => {
							if (prev !== id && prev !== "") setManualSessionId("");
							return id;
						});
					} catch {}
				};
				refresh();
				let off;
				try {
					const on = ctx?.on;
					if (typeof on === "function") {
						const handler = () => void refresh();
						on.call(ctx, "tokenOptima/updated", handler);
						off = () => {
							const offFn = ctx?.off;
							if (typeof offFn === "function") offFn.call(ctx, "tokenOptima/updated", handler);
						};
					}
				} catch {}
				const t = setInterval(() => void refresh(), 1e4);
				return () => {
					cancelled = true;
					clearInterval(t);
					off?.();
				};
			}, [ctx]);
			(0, react.useEffect)(() => {
				const origFetch = window.fetch;
				const origOpen = XMLHttpRequest.prototype.open;
				const scan = (url) => {
					try {
						const captured = url.match(/[?&]sessionId=(session-[0-9a-f-]+)/i)?.[1];
						if (captured) setFetchSessionId((prev) => prev === captured ? prev : captured);
					} catch {}
				};
				const fetchHandler = function(...args) {
					try {
						const first = args[0];
						const url = typeof first === "string" ? first : first instanceof URL ? first.href : first && typeof first === "object" && "url" in first ? String(first.url) : "";
						scan(url);
					} catch {}
					return origFetch.apply(this, args);
				};
				const openHandler = function(method, url, ...rest) {
					try {
						scan(typeof url === "string" ? url : url.href);
					} catch {}
					return origOpen.apply(this, [
						method,
						url,
						...rest
					]);
				};
				window.fetch = fetchHandler;
				XMLHttpRequest.prototype.open = openHandler;
				return () => {
					window.fetch = origFetch;
					XMLHttpRequest.prototype.open = origOpen;
				};
			}, []);
			(0, react.useEffect)(() => {
				const svc = getSessionSvc(ctx);
				if (!svc) return;
				let cancelled = false;
				const refresh = async () => {
					try {
						const r = await svc.list({});
						const items = r?.value?.items ?? r?.items ?? [];
						if (cancelled || !Array.isArray(items)) return;
						const map = {};
						for (const it of items) {
							const t = it?.projections?.values?.title;
							if (it?.sessionId && typeof t === "string" && t.length > 0) map[it.sessionId] = t;
						}
						setTitles((prev) => {
							return Object.keys(prev).length === Object.keys(map).length && Object.keys(map).every((k) => prev[k] === map[k]) ? prev : map;
						});
					} catch {}
				};
				refresh();
				const t = setInterval(() => void refresh(), 3e4);
				return () => {
					cancelled = true;
					clearInterval(t);
				};
			}, [ctx]);
			(0, react.useEffect)(() => {
				const handler = () => setOpen((prev) => !prev);
				window.addEventListener("token-optima:toggle", handler);
				return () => window.removeEventListener("token-optima:toggle", handler);
			}, []);
			(0, react.useEffect)(() => {
				const svc = getService(ctx);
				if (!svc) return;
				let cancelled = false;
				Promise.resolve(svc.report("")).then((r) => {
					const v = r?.value ?? r;
					if (!cancelled && v?.debug === true) window.__tokenOptimaDebug = {
						ctx,
						remote: ctx?.remote,
						namespaces: ctx?.remote?.namespaces,
						get service() {
							return getService(ctx);
						},
						get sessionSvc() {
							return getSessionSvc(ctx);
						},
						get currentSessionId() {
							return activeSessionId;
						},
						get titles() {
							return titles;
						}
					};
					else delete window.__tokenOptimaDebug;
				}).catch(() => {
					delete window.__tokenOptimaDebug;
				});
				return () => {
					cancelled = true;
					delete window.__tokenOptimaDebug;
				};
			}, [
				ctx,
				activeSessionId,
				titles
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [!open && !hasGridIcon && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FloatingButton, {
				dark,
				onClick: () => setOpen(true)
			}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Panel, {
				ctx,
				sessionId: activeSessionId,
				title: titles[activeSessionId] ?? "",
				dark,
				font,
				onClose: () => setOpen(false),
				onSessionChange: (id) => {
					if (id === hostSessionId) setManualSessionId("");
					else setManualSessionId(id);
				}
			})] });
		};
		let root = null;
		let host = null;
		async function apply(ctx) {
			ensureGlobalStyles();
			document.querySelectorAll("[data-dsh-token-optima=\"1\"]").forEach((el) => {
				try {
					el.remove();
				} catch {}
			});
			if (root) {
				try {
					root.unmount();
				} catch {}
				root = null;
			}
			if (host) {
				try {
					host.remove();
				} catch {}
				host = null;
			}
			if (typeof ctx?.remote?.$mount === "function") try {
				await ctx.remote.$mount(TYPERT_REMOTE);
			} catch (err) {
				console.error("[dsh-token-optima/client] $mount failed:", err);
			}
			else console.error("[dsh-token-optima/client] ctx.remote.$mount not available");
			host = document.createElement("div");
			host.dataset.dshTokenOptima = "1";
			document.body.appendChild(host);
			root = (0, react_dom_client.createRoot)(host);
			root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Root, { ctx }));
			const registry = window.__dshIconRegistry;
			if (registry) {
				const existingIndex = registry.findIndex((e) => e.id === "token-optima");
				if (existingIndex >= 0) registry.splice(existingIndex, 1);
				registry.push({
					id: "token-optima",
					icon: "🔮",
					label: "Token Optima",
					packageName: "dsh-token-optima",
					onClick: () => window.dispatchEvent(new CustomEvent("token-optima:toggle"))
				});
			} else console.log("[dsh-token-optima] DSH icon grid not found, falling back to floating button.");
			ctx.on("dispose", () => {
				root?.unmount();
				root = null;
				host?.remove();
				host = null;
				const r = window.__dshIconRegistry;
				if (r) {
					const i = r.findIndex((e) => e.id === "token-optima");
					if (i >= 0) r.splice(i, 1);
				}
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map