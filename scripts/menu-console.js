(function () {
  "use strict";

  // No se necesita ningún servidor propio: todo va directo a Kahoot.

  // Eliminar instancias previas si ya se ejecutó antes en la pestaña
  const PREV_UI = document.getElementById("kw-overlay-ui");
  if (PREV_UI) PREV_UI.remove();
  const PREV_BTN = document.getElementById("kw-reopen-btn");
  if (PREV_BTN) PREV_BTN.remove();
  const PREV_PIN_OVERLAY = document.getElementById("kw-pin-it-overlay");
  if (PREV_PIN_OVERLAY) PREV_PIN_OVERLAY.remove();
  if (window.__kwKeepAliveWorker) {
    try { window.__kwKeepAliveWorker.terminate(); } catch (_) { }
  }
  if (window.__kwPinWatchInterval) {
    clearInterval(window.__kwPinWatchInterval);
  }
  if (window.__kwAnswerColorInterval) {
    clearInterval(window.__kwAnswerColorInterval);
  }
  if (window.__kwAnswerColorObserver) {
    try { window.__kwAnswerColorObserver.disconnect(); } catch (_) { }
  }
  if (window.__kwChallengePerfObserver) {
    try { window.__kwChallengePerfObserver.disconnect(); } catch (_) { }
    window.__kwChallengePerfObserver = null;
  }

  const colors = {
    primary: "rgba(15, 5, 30, 0.97)",
    secondary: "rgba(25, 10, 50, 0.95)",
    accent: "rgba(120, 80, 255, 0.8)",
    text: "#f0f0ff",
    correct: "hsl(155, 100%, 60%)",
    incorrect: "hsl(350, 100%, 65%)",
    warning: "hsl(35, 100%, 60%)",
    close: "hsl(350, 100%, 65%)",
  };
  const SVG_NS = "http://www.w3.org/2000/svg";

  let questions = [];
  let debounceTimer = null;

  // Interfaz flotante
  const uiElement = document.createElement("div");
  uiElement.id = "kw-overlay-ui";
  Object.assign(uiElement.style, {
    position: "fixed",
    top: "2px",
    left: "2px",
    width: "420px",
    maxHeight: "85vh",
    backgroundColor: colors.primary,
    borderRadius: "12px",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.65)",
    zIndex: "999999",
    overflow: "hidden",
    border: `1px solid ${colors.accent}`,
    transform: "translateZ(0)",
    willChange: "transform, opacity",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    boxSizing: "border-box",
  });

  // Cabecera arrastrable (sin título, solo botón cerrar)
  const header = document.createElement("div");
  Object.assign(header.style, {
    padding: "8px 12px",
    backgroundColor: colors.secondary,
    cursor: "move",
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    userSelect: "none",
    borderBottom: `1px solid ${colors.accent}`,
    flexShrink: "0",
  });

  function createControlBtn(symbol, color) {
    const btn = document.createElement("div");
    btn.textContent = symbol;
    Object.assign(btn.style, {
      width: "26px",
      height: "26px",
      backgroundColor: color,
      color: "white",
      display: "grid",
      placeItems: "center",
      borderRadius: "50%",
      cursor: "pointer",
      fontSize: "14px",
      transition: "transform 0.15s ease, opacity 0.15s ease",
    });
    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "scale(1.1)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "scale(1)";
    });
    return btn;
  }

  const closeBtn = createControlBtn("✕", colors.close);
  header.append(closeBtn);
  uiElement.appendChild(header);

  // Contenedor principal
  const content = document.createElement("div");
  Object.assign(content.style, {
    padding: "15px",
    overflowY: "auto",
    scrollbarWidth: "thin",
    flexGrow: "1",
    display: "flex",
    flexDirection: "column",
    gap: "15px",
  });

  function createSection(titleText) {
    const section = document.createElement("div");
    Object.assign(section.style, {
      backgroundColor: colors.secondary,
      borderRadius: "10px",
      padding: "15px",
      border: `1px solid ${colors.accent}`,
      flexShrink: "0",
    });
    const h = document.createElement("h3");
    h.textContent = titleText;
    Object.assign(h.style, {
      margin: "0 0 12px 0",
      color: colors.text,
      fontSize: "15px",
      fontWeight: "600",
    });
    section.appendChild(h);
    return { section, body: section };
  }

  function createInput(placeholder) {
    const input = document.createElement("input");
    Object.assign(input.style, {
      width: "100%",
      padding: "10px 15px",
      borderRadius: "6px",
      border: `1px solid ${colors.accent}`,
      background: "rgba(0, 0, 0, 0.3)",
      color: colors.text,
      fontSize: "14px",
      outline: "none",
      transition: "all 0.3s ease",
      boxSizing: "border-box",
    });
    input.placeholder = placeholder;
    return input;
  }

  const quizIdSection = createSection("Quiz ID / PIN de Partida");

  // Cajón independiente para volver al selector con los candidatos que
  // superaron todos los filtros sin descartar el quiz elegido (pudo
  // seleccionarse por error). Permanece oculto hasta que se cumplan las
  // condiciones y se coloca encima del cajón de Quiz ID / PIN.
  const selectAnotherCandidateSection = createSection("¿Te equivocaste de quiz?");
  selectAnotherCandidateSection.section.style.display = "none";

  const selectAnotherCandidateBtn = document.createElement("button");
  selectAnotherCandidateBtn.type = "button";
  selectAnotherCandidateBtn.textContent = "Seleccionar otro candidato";
  Object.assign(selectAnotherCandidateBtn.style, {
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 14px",
    borderRadius: "6px",
    border: `1px solid ${colors.accent}`,
    background: "linear-gradient(135deg, #7c3aed, #f59e0b)",
    color: colors.text,
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.15s ease",
  });
  selectAnotherCandidateBtn.addEventListener("mouseenter", () => {
    selectAnotherCandidateBtn.style.transform = "scale(1.02)";
    selectAnotherCandidateBtn.style.borderColor = colors.correct;
  });
  selectAnotherCandidateBtn.addEventListener("mouseleave", () => {
    selectAnotherCandidateBtn.style.transform = "scale(1)";
    selectAnotherCandidateBtn.style.borderColor = colors.accent;
  });
  selectAnotherCandidateBtn.addEventListener("click", () => {
    if (!Array.isArray(filteredCandidateSurvivors) || filteredCandidateSurvivors.length < 2) {
      setSelectAnotherCandidateVisible(false);
      return;
    }
    renderQuizCandidatesSelector(filteredCandidateSurvivors);
  });
  selectAnotherCandidateSection.body.appendChild(selectAnotherCandidateBtn);

  const quizIdInput = createInput("Ingresa el Quiz UUID o PIN");
  quizIdSection.body.appendChild(quizIdInput);

  const statusMsg = document.createElement("div");
  Object.assign(statusMsg.style, {
    fontSize: "12px",
    marginTop: "8px",
    lineHeight: "1.4",
    display: "none",
  });
  quizIdSection.body.appendChild(statusMsg);
  content.appendChild(selectAnotherCandidateSection.section);
  content.appendChild(quizIdSection.section);

  // Interruptor maestro de las respuestas que se dibujan sobre la pantalla
  // de Kahoot (colores de botones y área correcta de Pin It).
  const answersDisplaySection = createSection("Mostrar respuestas en pantalla");

  const answersDisplayRow = document.createElement("div");
  Object.assign(answersDisplayRow.style, {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  });

  const answersDisplayToggle = document.createElement("button");
  answersDisplayToggle.type = "button";
  answersDisplayToggle.setAttribute("role", "switch");
  answersDisplayToggle.setAttribute("aria-checked", "true");
  answersDisplayToggle.setAttribute("aria-label", "Mostrar respuestas en pantalla");
  answersDisplayToggle.title = "Mostrar respuestas en pantalla";
  Object.assign(answersDisplayToggle.style, {
    position: "relative",
    width: "46px",
    height: "26px",
    padding: "0",
    border: "1px solid rgba(255, 255, 255, 0.35)",
    borderRadius: "13px",
    backgroundColor: colors.correct,
    cursor: "pointer",
    flexShrink: "0",
    transition: "background-color 0.2s ease, border-color 0.2s ease",
    outline: "none",
  });

  const answersDisplayToggleKnob = document.createElement("span");
  Object.assign(answersDisplayToggleKnob.style, {
    position: "absolute",
    top: "3px",
    left: "3px",
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    backgroundColor: "#ffffff",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.45)",
    transition: "transform 0.2s ease",
    transform: "translateX(20px)",
  });
  answersDisplayToggle.appendChild(answersDisplayToggleKnob);
  answersDisplayToggle.addEventListener("click", handleAnswersDisplayToggle);

  // Los avisos ocupan el hueco a la izquierda del interruptor. El
  // contenedor flexible mantiene el interruptor a la derecha aunque no
  // haya ningún aviso visible.
  const answersDisplayWarnings = document.createElement("div");
  Object.assign(answersDisplayWarnings.style, {
    flex: "1 1 auto",
    minWidth: "0",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  });

  const answersDisplayDefaultMessage = document.createElement("div");
  answersDisplayDefaultMessage.textContent =
    "Muestra las respuestas correctas de color verde directamente sobre la pantalla";
  Object.assign(answersDisplayDefaultMessage.style, {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: "12px",
    lineHeight: "1.4",
    display: "block",
  });

  const answersDisplayMessage = document.createElement("div");
  answersDisplayMessage.setAttribute("role", "status");
  answersDisplayMessage.setAttribute("aria-live", "polite");
  Object.assign(answersDisplayMessage.style, {
    color: colors.incorrect,
    fontSize: "12px",
    lineHeight: "1.4",
    display: "none",
  });

  const answersDisplayMidGameMessage = document.createElement("div");
  answersDisplayMidGameMessage.setAttribute("role", "status");
  answersDisplayMidGameMessage.setAttribute("aria-live", "polite");
  Object.assign(answersDisplayMidGameMessage.style, {
    color: colors.warning,
    fontSize: "12px",
    lineHeight: "1.4",
    display: "none",
  });

  answersDisplayWarnings.append(
    answersDisplayDefaultMessage,
    answersDisplayMessage,
    answersDisplayMidGameMessage
  );
  answersDisplayRow.append(answersDisplayWarnings, answersDisplayToggle);
  answersDisplaySection.body.appendChild(answersDisplayRow);
  content.appendChild(answersDisplaySection.section);

  const answersContainer = document.createElement("div");
  answersContainer.id = "kw-answers-container";
  Object.assign(answersContainer.style, {
    display: "flex",
    flexDirection: "column",
    gap: "15px",
  });
  content.appendChild(answersContainer);

  uiElement.appendChild(content);
  document.body.appendChild(uiElement);

  // Botón para reabrir cuando se minimiza
  const reopenBtn = document.createElement("button");
  reopenBtn.id = "kw-reopen-btn";
  reopenBtn.type = "button";
  reopenBtn.textContent = "abrir";
  Object.assign(reopenBtn.style, {
    position: "fixed",
    top: "16px",
    left: "16px",
    zIndex: "1000000",
    display: "none",
    padding: "5px 10px",
    borderRadius: "6px",
    border: "1px solid rgba(120, 80, 255, 0.3)",
    backgroundColor: "rgba(25, 10, 50, 0.55)",
    color: "rgba(240, 240, 255, 0.45)",
    fontSize: "12px",
    fontWeight: "500",
    cursor: "pointer",
    width: "auto",
    whiteSpace: "nowrap",
    boxShadow: "none",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    backdropFilter: "blur(4px)",
    transition: "opacity 0.2s ease",
    opacity: "0.6",
  });
  reopenBtn.addEventListener("mouseenter", () => { reopenBtn.style.opacity = "1"; });
  reopenBtn.addEventListener("mouseleave", () => { reopenBtn.style.opacity = "0.6"; });
  document.body.appendChild(reopenBtn);

  function clearAnswers() {
    answersContainer.replaceChildren();
  }

  // ─── Renderizado de LaTeX (KaTeX desde CDN, con respaldo de texto) ────
  // Kahoot guarda las fórmulas como <latex>...</latex>. Se cargan KaTeX y su
  // hoja de estilos una sola vez, y mientras tanto se muestra la fórmula como
  // texto plano para que nunca aparezcan las etiquetas literales.
  const KATEX_VERSION = "0.16.11";
  const KATEX_JS_URL = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;
  const KATEX_CSS_URL = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
  const LATEX_TAG_RE = /<latex\b[^>]*>([\s\S]*?)<\/latex>/gi;
  const pendingLatexElements = new Set();
  let katexLoadPromise = null;
  let katexLoadFailed = false;

  function decodeLatexEntities(value) {
    return String(value)
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/&nbsp;/gi, " ")
      .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
        try {
          return String.fromCodePoint(parseInt(hex, 16));
        } catch (_) {
          return match;
        }
      })
      .replace(/&#(\d+);/g, (match, dec) => {
        try {
          return String.fromCodePoint(parseInt(dec, 10));
        } catch (_) {
          return match;
        }
      })
      .replace(/&amp;/gi, "&");
  }

  function renderKatexInto(el, expr) {
    if (!el) return;
    const katex = window.katex;
    if (!katex || typeof katex.render !== "function") {
      el.textContent = expr;
      el.dataset.kwLatex = expr;
      if (!katexLoadFailed) {
        pendingLatexElements.add(el);
        ensureKatexLoaded();
      }
      return;
    }

    try {
      el.textContent = "";
      katex.render(expr, el, {
        throwOnError: false,
        errorColor: colors.incorrect,
        displayMode: false,
        strict: false,
        trust: false,
      });
      el.classList.add("kw-latex-rendered");
    } catch (_) {
      el.textContent = expr;
    }
  }

  function flushPendingLatex() {
    for (const el of Array.from(pendingLatexElements)) {
      pendingLatexElements.delete(el);
      if (!el.isConnected) continue;
      const expr = el.dataset.kwLatex || "";
      if (expr) renderKatexInto(el, expr);
    }
  }

  function ensureKatexLoaded() {
    if (window.katex && typeof window.katex.render === "function") {
      return Promise.resolve(window.katex);
    }
    if (katexLoadPromise) return katexLoadPromise;

    katexLoadPromise = new Promise((resolve) => {
      let settled = false;
      const finish = (katex) => {
        if (settled) return;
        settled = true;
        if (!katex) katexLoadFailed = true;
        resolve(katex || null);
      };

      const head = document.head || document.documentElement;
      if (!head) {
        finish(null);
        return;
      }

      if (!document.getElementById("kw-katex-css")) {
        const link = document.createElement("link");
        link.id = "kw-katex-css";
        link.rel = "stylesheet";
        link.href = KATEX_CSS_URL;
        link.crossOrigin = "anonymous";
        head.appendChild(link);
      }

      const existingScript = document.getElementById("kw-katex-script");
      if (existingScript) {
        if (window.katex && typeof window.katex.render === "function") {
          finish(window.katex);
          return;
        }
        existingScript.addEventListener(
          "load",
          () => finish(window.katex || null),
          { once: true }
        );
        existingScript.addEventListener("error", () => finish(null), {
          once: true,
        });
      } else {
        const script = document.createElement("script");
        script.id = "kw-katex-script";
        script.src = KATEX_JS_URL;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.addEventListener("load", () => finish(window.katex || null), {
          once: true,
        });
        script.addEventListener("error", () => finish(null), { once: true });
        head.appendChild(script);
      }

      // Si el CDN no responde o el script ya estaba cargado sin exponer KaTeX,
      // no bloqueamos el menú: se queda el texto plano como respaldo.
      setTimeout(() => {
        if (window.katex && typeof window.katex.render === "function") {
          finish(window.katex);
        } else {
          finish(null);
        }
      }, 8000);
    }).then((katex) => {
      if (katex) {
        flushPendingLatex();
      } else {
        // Si el CDN falla, no hace falta conservar referencias a elementos
        // que ya se quedaron con el texto plano como respaldo.
        pendingLatexElements.clear();
      }
      return katex;
    });

    return katexLoadPromise;
  }

  function appendRichSegment(container, segment, allowHtml) {
    if (!segment) return;
    if (allowHtml) {
      // La pregunta ya se mostraba con innerHTML; se conserva ese comportamiento
      // para no perder negritas, saltos de línea u otro formato de Kahoot.
      const template = document.createElement("template");
      template.innerHTML = segment;
      container.appendChild(template.content);
    } else {
      // Las respuestas se mostraban como texto plano; se mantiene así para que
      // cualquier otro HTML no se interprete por accidente.
      container.appendChild(document.createTextNode(segment));
    }
  }

  function latexToPlainText(value) {
    return String(value === null || value === undefined ? "" : value).replace(
      LATEX_TAG_RE,
      "$1"
    );
  }

  function renderRichText(container, rawText, options) {
    if (!container) return;
    const allowHtml = !!(options && options.html);
    const source = rawText === null || rawText === undefined ? "" : String(rawText);
    container.replaceChildren();

    let lastIndex = 0;
    LATEX_TAG_RE.lastIndex = 0;
    let match;
    while ((match = LATEX_TAG_RE.exec(source)) !== null) {
      appendRichSegment(container, source.slice(lastIndex, match.index), allowHtml);

      const expr = decodeLatexEntities(match[1]).trim();
      const latex = document.createElement("span");
      latex.className = "kw-latex";
      latex.style.display = "inline-block";
      latex.style.verticalAlign = "middle";
      latex.style.maxWidth = "100%";
      latex.dataset.kwLatex = expr;
      if (expr) renderKatexInto(latex, expr);
      container.appendChild(latex);

      lastIndex = LATEX_TAG_RE.lastIndex;
    }
    appendRichSegment(container, source.slice(lastIndex), allowHtml);
  }

  function createQuestionCard(index, question) {
    const card = document.createElement("div");
    Object.assign(card.style, {
      backgroundColor: colors.secondary,
      borderRadius: "10px",
      padding: "15px",
      border: `1px solid ${colors.accent}`,
      flexShrink: "0",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    });

    const qHeader = document.createElement("div");
    qHeader.textContent = `Pregunta ${index + 1}`;
    Object.assign(qHeader.style, {
      color: colors.text,
      fontSize: "15px",
      fontWeight: "700",
      borderBottom: "1px solid rgba(120, 80, 255, 0.35)",
      paddingBottom: "6px",
    });
    card.appendChild(qHeader);

    const qText = document.createElement("div");
    renderRichText(qText, question.questionText || "", { html: true });
    Object.assign(qText.style, {
      color: "rgba(255, 255, 255, 0.85)",
      fontSize: "13px",
      fontStyle: "italic",
      lineHeight: "1.3",
    });
    card.appendChild(qText);

    const typeLabel = document.createElement("div");
    typeLabel.textContent = typeToLabel(question.type);
    Object.assign(typeLabel.style, {
      color: "rgba(255, 255, 255, 0.5)",
      fontSize: "11px",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
    });
    card.appendChild(typeLabel);

    const body = document.createElement("div");
    Object.assign(body.style, {
      backgroundColor: "rgba(0, 0, 0, 0.35)",
      borderRadius: "8px",
      padding: "10px 12px",
      border: "1px solid rgba(120, 80, 255, 0.5)",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    });

    if (question.type === "quiz" || question.type === "multiple_select_quiz" || question.type === "true_false") {
      if (!question.correctTexts || question.correctTexts.length === 0) {
        const none = document.createElement("div");
        none.textContent = "No se pudo determinar la respuesta";
        none.style.color = colors.incorrect;
        body.appendChild(none);
      } else {
        question.correctTexts.forEach((entry) => {
          // entry puede ser { text, imageId } o un string (compatibilidad)
          const text = typeof entry === "object" ? entry.text : entry;
          const imageId = typeof entry === "object" ? entry.imageId : null;

          if (imageId) {
            // Respuesta de tipo imagen
            const imgEl = document.createElement("img");
            imgEl.src = `https://images-cdn.kahoot.it/${imageId}?auto=webp&dpr=1&width=400`;
            imgEl.alt = "Respuesta correcta";
            Object.assign(imgEl.style, {
              maxWidth: "100%",
              maxHeight: "180px",
              objectFit: "contain",
              borderRadius: "6px",
              border: `2px solid ${colors.correct}`,
              display: "block",
            });
            body.appendChild(imgEl);
          } else if (text !== undefined && text !== null && text !== "") {
            // Respuesta de tipo texto
            const line = document.createElement("div");
            renderRichText(line, text);
            Object.assign(line.style, {
              color: colors.correct,
              fontSize: "14px",
              fontWeight: "700",
              lineHeight: "1.4",
            });
            body.appendChild(line);
          } else {
            // No hay ni texto ni imagen
            const line = document.createElement("div");
            line.textContent = "No se pudo determinar la respuesta";
            line.style.color = colors.incorrect;
            body.appendChild(line);
          }
        });
      }
    } else if (question.type === "open_ended") {
      if (question.answers && question.answers.length > 0) {
        const fillHint = document.createElement("div");
        fillHint.textContent =
          "La respuesta se escribirá automaticamente si la opción Mostrar respuestas en pantalla está activada.";
        Object.assign(fillHint.style, {
          color: "rgba(255, 255, 255, 0.45)",
          fontSize: "11px",
          lineHeight: "1.3",
        });
        body.appendChild(fillHint);

        if (question.answers.length > 1) {
          const lbl = document.createElement("div");
          lbl.textContent = "Respuestas aceptadas:";
          Object.assign(lbl.style, {
            color: "rgba(255, 255, 255, 0.6)",
            fontSize: "12px",
          });
          body.appendChild(lbl);
        }
        question.answers.forEach((ans, i) => {
          const row = document.createElement("div");
          Object.assign(row.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          });

          const line = document.createElement("div");
          renderRichText(
            line,
            question.answers.length > 1 ? `${i + 1}. ${ans}` : ans
          );
          Object.assign(line.style, {
            color: colors.correct,
            fontSize: "15px",
            fontWeight: "700",
            flex: "1 1 auto",
            wordBreak: "break-word",
          });

          const copyBtn = document.createElement("button");
          copyBtn.type = "button";
          copyBtn.textContent = "Copiar";
          Object.assign(copyBtn.style, {
            padding: "4px 10px",
            borderRadius: "6px",
            border: `1px solid ${colors.accent}`,
            background: "rgba(0, 0, 0, 0.4)",
            color: colors.text,
            fontSize: "12px",
            cursor: "pointer",
            flexShrink: "0",
            width: "60px",
            textAlign: "center",
          });

          copyBtn.addEventListener("click", async () => {
            const copyText = latexToPlainText(ans);
            try {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(copyText);
              } else {
                const tmp = document.createElement("textarea");
                tmp.value = copyText;
                document.body.appendChild(tmp);
                tmp.select();
                document.execCommand("copy");
                tmp.remove();
              }
              copyBtn.textContent = "✓";
              setTimeout(() => {
                copyBtn.textContent = "Copiar";
              }, 900);
            } catch (_) {
              copyBtn.textContent = "Error";
              setTimeout(() => {
                copyBtn.textContent = "Copiar";
              }, 900);
            }
          });

          row.append(line, copyBtn);
          body.appendChild(row);
        });
      }
    } else if (question.type === "jumble") {
      const hint = document.createElement("div");
      hint.textContent = "Orden correcto:";
      Object.assign(hint.style, {
        color: "rgba(255, 255, 255, 0.6)",
        fontSize: "12px",
      });
      body.appendChild(hint);
      (question.answers || []).forEach((ans) => {
        const line = document.createElement("div");
        renderRichText(line, ans);
        Object.assign(line.style, {
          color: colors.correct,
          fontSize: "14px",
          fontWeight: "700",
          padding: "3px 0",
          borderBottom: "1px solid rgba(120, 80, 255, 0.2)",
        });
        body.appendChild(line);
      });
      if (body.lastElementChild) {
        body.lastElementChild.style.borderBottom = "none";
      }
    } else if (String(question.type || "").toLowerCase() === "survey") {
      const survey = document.createElement("div");
      survey.textContent =
        'Esta "pregunta" es una encuesta, por lo mismo, no tiene respuesta correcta';
      Object.assign(survey.style, {
        color: "rgba(255, 255, 255, 0.5)",
        fontSize: "13px",
        lineHeight: "1.4",
      });
      body.appendChild(survey);
    } else if (question.type === "pin_it") {
      if (question.image && question.choiceShapes && question.choiceShapes.length) {
        const wrapper = document.createElement("div");
        Object.assign(wrapper.style, {
          display: "grid",
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid rgba(120, 80, 255, 0.8)",
        });
        const img = document.createElement("img");
        img.src = question.image;
        img.alt = "Pin it";
        Object.assign(img.style, {
          gridArea: "1 / 1",
          width: "100%",
          display: "block",
        });
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const w = Number(question.imageWidth) || 1024;
        const h = Number(question.imageHeight) || 576;
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svg.setAttribute("preserveAspectRatio", "none");
        Object.assign(svg.style, {
          gridArea: "1 / 1",
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        });
        renderPinShapes(svg, question.choiceShapes);
        wrapper.append(img, svg);
        body.appendChild(wrapper);
      } else {
        const none = document.createElement("div");
        none.textContent = "Sin datos de imagen.";
        none.style.color = colors.incorrect;
        body.appendChild(none);
      }
    } else {
      const unknown = document.createElement("div");
      unknown.textContent = "Tipo de pregunta no soportado.";
      unknown.style.color = "rgba(255, 255, 255, 0.5)";
      body.appendChild(unknown);
    }

    card.appendChild(body);
    return card;
  }

  function typeToLabel(type) {
    switch (type) {
      case "quiz":
        return "Respuesta única";
      case "multiple_select_quiz":
        return "Respuesta múltiple";
      case "true_false":
        return "Verdadero o Falso";
      case "open_ended":
        return "Respuesta abierta";
      case "jumble":
        return "Ordenar";
      case "pin_it":
        return "Pin it";
      default:
        return type || "Desconocido";
    }
  }

  function normalizeText(str) {
    return (str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  // Dibuja las formas correctas de un Pin It. Se usa tanto en la miniatura
  // del menú como sobre la imagen real de la partida.
  function appendPinShape(svg, shape) {
    if (!svg || !shape) return;
    const fill = "rgba(0, 255, 140, 0.25)";
    const stroke = "rgba(0, 255, 140, 0.95)";
    const type = String(shape.type || "").toLowerCase();
    if (type === "ellipse") {
      const cx = Number(shape.x);
      const cy = Number(shape.y);
      const rx = Number(shape.radiusX);
      const ry = Number(shape.radiusY);
      if (![cx, cy, rx, ry].every(Number.isFinite)) return;
      const ell = document.createElementNS(SVG_NS, "ellipse");
      ell.setAttribute("cx", cx);
      ell.setAttribute("cy", cy);
      ell.setAttribute("rx", rx);
      ell.setAttribute("ry", ry);
      ell.setAttribute("fill", fill);
      ell.setAttribute("stroke", stroke);
      ell.setAttribute("stroke-width", "4");
      ell.style.fill = fill;
      ell.style.stroke = stroke;
      ell.style.strokeWidth = "4";
      ell.style.pointerEvents = "none";
      svg.appendChild(ell);
    } else if (type === "polygon" && Array.isArray(shape.points)) {
      const points = shape.points
        .filter((p) => p && typeof p === "object")
        .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!points.length) return;
      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute(
        "points",
        points.map((p) => `${p.x},${p.y}`).join(" ")
      );
      poly.setAttribute("fill", fill);
      poly.setAttribute("stroke", stroke);
      poly.setAttribute("stroke-width", "4");
      poly.style.fill = fill;
      poly.style.stroke = stroke;
      poly.style.strokeWidth = "4";
      poly.style.pointerEvents = "none";
      svg.appendChild(poly);
    }
  }

  function renderPinShapes(svg, shapes) {
    if (!Array.isArray(shapes)) return;
    shapes.forEach((shape) => appendPinShape(svg, shape));
  }

  // ─── Mostrar respuestas en pantalla (botones + Pin It) ────────────────
  // El interruptor "Mostrar respuestas en pantalla" manda sobre los dos.
  // Por seguridad se desactiva solo cuando randomAnswers o randomQuestions
  // son true. El usuario puede reactivarlo manualmente; en ese caso se
  // mantiene un aviso rojo porque las respuestas podrían no coincidir.
  // Si faltan los flags o no son booleanos, no se pinta por defecto.
  const ANSWER_BUTTON_SELECTOR =
    '[data-functional-selector^="answer-"], [data-functional-selector^="multi-select-button-"]';
  const PIN_IT_IMAGE_SELECTOR =
    '[data-functional-selector="media-container__media-image"]';
  const TEXT_ANSWER_INPUT_SELECTOR =
    'input[data-functional-selector="text-answer-input"]';
  const PIN_IT_OVERLAY_ID = "kw-pin-it-overlay";
  const PAINTABLE_QUESTION_TYPES = new Set(["quiz", "multiple_select_quiz", "true_false"]);
  const paintedAnswerButtons = new Map();
  let pinItOverlayKey = "";
  let pinItOverlaySvg = null;

  function isPaintableQuestion(question) {
    return !!question &&
      PAINTABLE_QUESTION_TYPES.has(String(question.type || "").toLowerCase());
  }

  function updateAnswerColoringState(payload) {
    const isQuizStartPacket = !!(payload && payload.firstGameBlockData);
    // Un QuizStart real confirma que no estamos en modo challenge, incluso
    // si el quiz completo ya estaba cargado y processKahootPayload retorna
    // antes de llegar a onQuizStartDetected().
    if (isQuizStartPacket && challengeModeDetected) {
      challengeModeDetected = false;
      challengeQuestionIndex = null;
    }
    const options = payload && (
      payload.gameOptions ||
      (payload.firstGameBlockData && payload.firstGameBlockData.gameOptions)
    );

    const hasValidFlags = !!options &&
      typeof options.randomAnswers === "boolean" &&
      typeof options.randomQuestions === "boolean";

    if (!hasValidFlags) {
      // Los paquetes que no traen flags (respuestas REST, búsquedas, etc.)
      // no deben borrar un estado ya confirmado. Solo un QuizStart sin flags
      // vuelve al modo seguro.
      if (!isQuizStartPacket) return;

      randomFlagsAllowAnswers = false;
      if (!manualOverrideRandomFlags) {
        console.log(
          "%c[KW Color]%c QuizStart sin gameOptions válidos; no se mostrarán respuestas por seguridad.",
          "color:#ef4444;font-weight:bold;",
          "color:inherit"
        );
      }
      refreshAnswersDisplayState();
      return;
    }

    const allowed = options.randomAnswers === false && options.randomQuestions === false;
    const previous = lastRandomFlagsAllowed;
    lastRandomFlagsAllowed = allowed;
    randomFlagsAllowAnswers = allowed;

    // Ya conocemos los flags reales; el aviso de partida empezada sobra.
    midGameDetected = false;
    midGameCandidateSince = 0;

    const answersRandomized = options.randomAnswers !== false;
    const questionsRandomized = options.randomQuestions !== false;
    if (answersRandomized && questionsRandomized) {
      lastRandomFlagsReason =
        "las preguntas y las respuestas están aleatorizadas";
    } else if (questionsRandomized) {
      lastRandomFlagsReason = "las preguntas están aleatorizadas";
    } else if (answersRandomized) {
      lastRandomFlagsReason = "las respuestas están aleatorizadas";
    } else {
      lastRandomFlagsReason = "";
    }

    if (allowed) {
      manualOverrideRandomFlags = false;
      if (autoDisabledByRandomFlags) {
        showAnswersEnabled = true;
        autoDisabledByRandomFlags = false;
      }
    } else if (
      previous !== false &&
      showAnswersEnabled &&
      !manualOverrideRandomFlags
    ) {
      // Primera vez que se detectan flags aleatorios: se desactiva solo.
      showAnswersEnabled = false;
      autoDisabledByRandomFlags = true;
    }

    if (previous !== allowed) {
      console.log(
        `%c[KW Color]%c Mostrar respuestas ${allowed ? "PERMITIDO" : "BLOQUEADO"} ` +
        `(randomAnswers = ${options.randomAnswers}, randomQuestions = ${options.randomQuestions}).`,
        `color:${allowed ? "#22c55e" : "#ef4444"};font-weight:bold;`,
        "color:inherit"
      );
    }

    refreshAnswersDisplayState();
  }

  function readDomQuestionIndex() {
    try {
      const counterEl = document.querySelector('[data-functional-selector="question-index-counter"]');
      if (!counterEl) return null;
      const txt = (counterEl.textContent || counterEl.parentElement?.textContent || "").trim();
      const match = txt.match(/\b(\d+)\s*(?:de|\/|of)\s*(\d+)\b/i);
      if (match) {
        const cur = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        if (cur >= 1 && (!total || cur <= total)) return cur - 1;
      }
      const onlyNumber = parseInt(txt, 10);
      if (Number.isInteger(onlyNumber) && onlyNumber >= 1) return onlyNumber - 1;
    } catch (_) { }
    return null;
  }

  function getCurrentQuestionIndex() {
    // En challenge no hay contador visible ni QuizStart. `upToQuestion` es la
    // única referencia fiable del bloque actual (0 = Pregunta 1).
    if (challengeModeDetected && challengeQuestionIndex !== null) {
      liveQuestionIndex = challengeQuestionIndex;
      return challengeQuestionIndex;
    }

    // El índice del paquete (gameBlockIndex) es la fuente principal porque
    // se actualiza antes que el contador visible. Si el contador del DOM va
    // por delante (por ejemplo, el paquete aún no llegó), usamos el mayor:
    // ambos apuntan a bloques del mismo array questions[].
    const domIndex = readDomQuestionIndex();

    // A mitad de partida el contador del DOM es la única referencia fiable
    // del número de pregunta; los paquetes que lleguen después no deben
    // desplazar el índice a un bloque de contenido.
    if (midGameDetected && lastRandomFlagsAllowed === null && domIndex !== null) {
      liveQuestionIndex = domIndex;
      return domIndex;
    }

    if (typeof liveQuestionIndex === "number" && liveQuestionIndex >= 0) {
      if (domIndex !== null && domIndex > liveQuestionIndex) {
        liveQuestionIndex = domIndex;
      }
      return liveQuestionIndex;
    }

    if (domIndex !== null) {
      liveQuestionIndex = domIndex;
      return domIndex;
    }

    // Si el contador aún no existe (por ejemplo, justo al cargar Q1),
    // asumimos la primera pregunta.
    return 0;
  }

  function hasPaintIndexes(question) {
    return isPaintableQuestion(question) &&
      ((Array.isArray(question.correctIndexes) && question.correctIndexes.length > 0) ||
        (Array.isArray(question.incorrectIndexes) && question.incorrectIndexes.length > 0));
  }

  function getQuestionForPaint(index) {
    // toohak usa directamente questions[info.questionNum]. No filtramos los
    // bloques de contenido ni las preguntas no pintables: el índice del
    // juego incluye todos los bloques, y filtrar desplazaría la pregunta
    // (por ejemplo, pintando una multi-respuesta en una de respuesta única).
    const direct = questions[index];
    if (hasPaintIndexes(direct)) return direct;

    // Mientras se carga el quiz completo, Q1 puede pintarse con el bloque
    // que vino dentro del propio paquete QuizStart.
    if (index === 0 && firstQuestionBlock && Array.isArray(firstQuestionBlock.choices)) {
      const firstType = String(firstQuestionBlock.type || "quiz").toLowerCase();
      if (PAINTABLE_QUESTION_TYPES.has(firstType)) {
        const correctIndexes = [];
        const incorrectIndexes = [];
        firstQuestionBlock.choices.forEach((choice, i) => {
          (choice.correct ? correctIndexes : incorrectIndexes).push(i);
        });
        if (correctIndexes.length || incorrectIndexes.length) {
          return {
            type: firstType,
            correctIndexes,
            incorrectIndexes,
          };
        }
      }
    }

    return null;
  }

  function restorePaintedAnswerButton(btn) {
    const original = paintedAnswerButtons.get(btn);
    if (!original) return;
    if (original.value) {
      btn.style.setProperty("background-color", original.value, original.priority);
    } else {
      btn.style.removeProperty("background-color");
    }
    paintedAnswerButtons.delete(btn);
  }

  function resetPaintedAnswerButtons() {
    for (const btn of Array.from(paintedAnswerButtons.keys())) {
      if (btn.isConnected) {
        restorePaintedAnswerButton(btn);
      } else {
        paintedAnswerButtons.delete(btn);
      }
    }
  }

  function findAnswerButtonByIndex(index) {
    // Equivalente a FindByAttributeValue de toohak: solo el primer nodo
    // exacto para ese índice. Así no se pintan duplicados/wrappers ocultos.
    const values = ["answer-" + index, "multi-select-button-" + index];
    for (const value of values) {
      try {
        const btn = document.querySelector(`[data-functional-selector="${value}"]`);
        if (btn) return btn;
      } catch (_) { }
    }
    return null;
  }

  function paintAnswerButton(btn, color) {
    if (!paintedAnswerButtons.has(btn)) {
      paintedAnswerButtons.set(btn, {
        value: btn.style.getPropertyValue("background-color"),
        priority: btn.style.getPropertyPriority("background-color"),
      });
    }
    btn.style.setProperty("background-color", color, "important");
  }

  function paintKahootAnswerButtons() {
    // Limpiar primero, igual que toohak: si la pregunta cambió, los botones
    // reutilizados no deben conservar el color de la pregunta anterior.
    resetPaintedAnswerButtons();

    if (!answerColoringEnabled) return;

    const question = getQuestionForPaint(getCurrentQuestionIndex());
    if (!question) return;

    const correct = Array.isArray(question.correctIndexes) ? question.correctIndexes : [];
    const incorrect = Array.isArray(question.incorrectIndexes) ? question.incorrectIndexes : [];
    if (!correct.length && !incorrect.length) return;

    correct.forEach((index) => {
      const btn = findAnswerButtonByIndex(index);
      if (btn) paintAnswerButton(btn, colors.correct);
    });

    incorrect.forEach((index) => {
      const btn = findAnswerButtonByIndex(index);
      if (btn) paintAnswerButton(btn, colors.incorrect);
    });
  }

  // ─── Pin It sobre la imagen real de la partida ───────────────────────
  // La imagen viva y la del REST usan hosts distintos (images-cdn.kahoot.it
  // y media.kahoot.it), pero comparten el UUID del archivo. Ese UUID es la
  // clave para identificar la pregunta actual sin depender del orden.

  function extractMediaId(url) {
    const value = String(url || "").trim();
    if (!value) return "";
    const match = value.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    if (match) return match[0].toLowerCase();
    return value.split("#")[0].split("?")[0];
  }

  function getElementImageUrl(el) {
    if (!el) return "";
    try {
      const tag = el.tagName.toLowerCase();
      if (tag === "img") {
        return el.currentSrc || el.src || el.getAttribute("src") || "";
      }
      return (
        el.getAttribute("href") ||
        el.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
        el.getAttribute("src") ||
        ""
      );
    } catch (_) {
      return "";
    }
  }

  function findLivePinItImage() {
    let best = null;
    let bestArea = 0;
    let nodes;
    try {
      nodes = document.querySelectorAll(PIN_IT_IMAGE_SELECTOR);
    } catch (_) {
      return null;
    }
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      if (!(area > 0)) continue;

      // Evitar imágenes precargadas, ocultas o fuera de la pantalla.
      try {
        const style = getComputedStyle(node);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          parseFloat(style.opacity) === 0
        ) {
          continue;
        }
      } catch (_) { }
      if (
        rect.bottom <= 0 ||
        rect.right <= 0 ||
        rect.top >= window.innerHeight ||
        rect.left >= window.innerWidth
      ) {
        continue;
      }

      if (area > bestArea) {
        best = node;
        bestArea = area;
      }
    }
    return best;
  }

  function findPinItQuestionByImageId(imageId) {
    if (!imageId) return null;
    const matches = [];
    for (const question of questions) {
      if (!question) continue;
      const type = String(question.type || "").toLowerCase();
      if (type !== "pin_it") continue;
      if (extractMediaId(question.image) === imageId) matches.push(question);
    }

    if (!matches.length && firstQuestionBlock) {
      const firstType = String(firstQuestionBlock.type || "").toLowerCase();
      if (
        firstType === "pin_it" &&
        extractMediaId(firstQuestionBlock.image) === imageId &&
        Array.isArray(firstQuestionBlock.choiceShapes) &&
        firstQuestionBlock.choiceShapes.length
      ) {
        return {
          type: "pin_it",
          image: firstQuestionBlock.image || "",
          imageWidth: firstQuestionBlock.imageMetadata?.width || 0,
          imageHeight: firstQuestionBlock.imageMetadata?.height || 0,
          choiceShapes: firstQuestionBlock.choiceShapes,
        };
      }
    }

    if (!matches.length) return null;
    if (matches.length === 1) return matches[0];

    // Si la misma imagen se usa en más de una pregunta Pin It, preferimos
    // la que corresponde al índice actual.
    const current = questions[getCurrentQuestionIndex()];
    if (current && matches.includes(current)) return current;
    return matches[0];
  }

  function getPinItImageContentRect(el, nativeW, nativeH) {
    const rect = el.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;

    const tag = el.tagName.toLowerCase();
    let fit = "fill";
    if (tag === "img") {
      try {
        fit = getComputedStyle(el).objectFit || "fill";
      } catch (_) { }
    } else if (tag === "image") {
      const par = el.getAttribute("preserveAspectRatio");
      if (par === null || !/\bnone\b/i.test(par)) {
        fit = /\bslice\b/i.test(par || "") ? "cover" : "contain";
      }
    }

    if (!(nativeW > 0) || !(nativeH > 0)) {
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    }

    if (fit === "contain") {
      const scale = Math.min(rect.width / nativeW, rect.height / nativeH);
      const width = nativeW * scale;
      const height = nativeH * scale;
      return {
        left: rect.left + (rect.width - width) / 2,
        top: rect.top + (rect.height - height) / 2,
        width,
        height,
      };
    }

    if (fit === "cover") {
      // El contenido se recorta dentro del rect. El contenedor del overlay
      // cubre el rect visible y el SVG interno se recorta con overflow.
      const scale = Math.max(rect.width / nativeW, rect.height / nativeH);
      const width = nativeW * scale;
      const height = nativeH * scale;
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        svgLeft: (rect.width - width) / 2,
        svgTop: (rect.height - height) / 2,
        svgWidth: width,
        svgHeight: height,
      };
    }

    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function ensurePinItOverlay() {
    let overlay = document.getElementById(PIN_IT_OVERLAY_ID);
    if (overlay) return overlay;
    if (!document.body) return null;

    overlay = document.createElement("div");
    overlay.id = PIN_IT_OVERLAY_ID;
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "fixed",
      display: "block",
      pointerEvents: "none",
      zIndex: "999998",
      overflow: "hidden",
      margin: "0",
      padding: "0",
      border: "0",
      backgroundColor: "transparent",
      boxSizing: "border-box",
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function removePinItOverlay() {
    const overlay = document.getElementById(PIN_IT_OVERLAY_ID);
    if (overlay) overlay.remove();
    pinItOverlayKey = "";
    pinItOverlaySvg = null;
  }

  function updatePinItOverlay() {
    try {
      if (!document.body) {
        removePinItOverlay();
        return;
      }

      // El overlay Pin It sigue el mismo interruptor y el mismo gate de
      // randomAnswers/randomQuestions que el coloreado de botones.
      if (!answerColoringEnabled) {
        removePinItOverlay();
        return;
      }

      // El tipo del bloque vivo manda. Si aún no lo conocemos (por ejemplo,
      // si el script se cargó a mitad de la partida), usamos el índice.
      // A mitad de partida sin flags, el tipo vivo puede estar obsoleto; en
      // ese caso dejamos que la imagen real decida si es una pregunta Pin It.
      const midGameUnknown = midGameDetected && lastRandomFlagsAllowed === null;
      // En challenge el índice de upToQuestion es autoritativo; el tipo vivo
      // puede ser de otra pregunta. Igual que a mitad de partida, dejamos que
      // la imagen real decida si el bloque actual es un Pin It.
      const challengeIndexAuthoritative =
        challengeModeDetected && challengeQuestionIndex !== null &&
        lastRandomFlagsAllowed === null;
      if (!midGameUnknown && !challengeIndexAuthoritative) {
        if (liveQuestionType) {
          if (String(liveQuestionType).toLowerCase() !== "pin_it") {
            removePinItOverlay();
            return;
          }
        } else {
          const currentQuestion = questions[getCurrentQuestionIndex()];
          const currentType = currentQuestion && currentQuestion.type
            ? String(currentQuestion.type).toLowerCase()
            : "";
          if (currentType !== "pin_it") {
            removePinItOverlay();
            return;
          }
        }
      }

      const imageEl = findLivePinItImage();
      if (!imageEl) {
        removePinItOverlay();
        return;
      }

      const imageId = extractMediaId(getElementImageUrl(imageEl));
      if (!imageId) {
        removePinItOverlay();
        return;
      }

      const question = findPinItQuestionByImageId(imageId);
      if (
        !question ||
        !Array.isArray(question.choiceShapes) ||
        !question.choiceShapes.length
      ) {
        removePinItOverlay();
        return;
      }

      let nativeW = Number(question.imageWidth) || 0;
      let nativeH = Number(question.imageHeight) || 0;
      if (!(nativeW > 0) || !(nativeH > 0)) {
        if (imageEl.tagName.toLowerCase() === "img") {
          nativeW = nativeW || imageEl.naturalWidth || 0;
          nativeH = nativeH || imageEl.naturalHeight || 0;
        } else {
          nativeW = nativeW || parseFloat(imageEl.getAttribute("width")) || 0;
          nativeH = nativeH || parseFloat(imageEl.getAttribute("height")) || 0;
        }
      }
      if (!(nativeW > 0) || !(nativeH > 0)) {
        nativeW = 1024;
        nativeH = 576;
      }

      const content = getPinItImageContentRect(imageEl, nativeW, nativeH);
      if (!content) {
        removePinItOverlay();
        return;
      }

      const overlay = ensurePinItOverlay();
      if (!overlay) {
        removePinItOverlay();
        return;
      }

      Object.assign(overlay.style, {
        left: `${content.left}px`,
        top: `${content.top}px`,
        width: `${content.width}px`,
        height: `${content.height}px`,
      });

      const key = [
        imageId,
        nativeW,
        nativeH,
        JSON.stringify(question.choiceShapes),
      ].join("|");

      if (
        key !== pinItOverlayKey ||
        !pinItOverlaySvg ||
        !pinItOverlaySvg.isConnected
      ) {
        overlay.textContent = "";
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", `0 0 ${nativeW} ${nativeH}`);
        svg.setAttribute("preserveAspectRatio", "none");
        Object.assign(svg.style, {
          position: "absolute",
          display: "block",
          pointerEvents: "none",
        });
        renderPinShapes(svg, question.choiceShapes);
        overlay.appendChild(svg);
        pinItOverlaySvg = svg;
        pinItOverlayKey = key;
      }

      if (pinItOverlaySvg) {
        if (content.svgWidth) {
          Object.assign(pinItOverlaySvg.style, {
            left: `${content.svgLeft}px`,
            top: `${content.svgTop}px`,
            width: `${content.svgWidth}px`,
            height: `${content.svgHeight}px`,
          });
        } else {
          Object.assign(pinItOverlaySvg.style, {
            left: "0",
            top: "0",
            width: "100%",
            height: "100%",
          });
        }
      }
    } catch (_) {
      removePinItOverlay();
    }
  }

  function scheduleAnswerPaint(delay = 10) {
    if (answerPaintTimer) return;
    answerPaintTimer = setTimeout(() => {
      answerPaintTimer = null;
      paintKahootAnswerButtons();
      updatePinItOverlay();
      fillOpenEndedAnswer();
    }, delay);
  }

  // ─── Autocompletado de preguntas abiertas ─────────────────────────────
  // Kahoot usa un input controlado por React. Escribir directamente en
  // `input.value` no actualiza su estado interno, así que usamos el setter
  // nativo y disparamos input/change, igual que el snippet manual.
  function getCurrentOpenEndedQuestion() {
    const index = getCurrentQuestionIndex();
    const question = questions[index];
    if (question) {
      return String(question.type || "").toLowerCase() === "open_ended"
        ? question
        : null;
    }

    // Si el REST aún no ha cargado el quiz, la Pregunta 1 puede venir dentro
    // del propio paquete QuizStart. Se cachea el objeto para que el control
    // de "ya rellenado" siga funcionando entre llamadas.
    if (index === 0 && firstQuestionBlock) {
      const type = String(firstQuestionBlock.type || "").toLowerCase();
      if (type !== "open_ended") return null;
      if (
        firstBlockOpenEndedSource === firstQuestionBlock &&
        firstBlockOpenEndedQuestion
      ) {
        return firstBlockOpenEndedQuestion;
      }
      firstBlockOpenEndedSource = firstQuestionBlock;
      firstBlockOpenEndedQuestion = {
        type,
        answers: (firstQuestionBlock.choices || []).map((choice) => choice.answer),
      };
      return firstBlockOpenEndedQuestion;
    }

    return null;
  }

  function getFirstOpenEndedAnswer(question) {
    if (!question || !Array.isArray(question.answers)) return "";
    for (const entry of question.answers) {
      const raw = entry && typeof entry === "object"
        ? (entry.answer ?? entry.text ?? "")
        : entry;
      const text = latexToPlainText(raw).trim();
      if (text) return text;
    }
    return "";
  }

  function fillOpenEndedAnswer() {
    if (!answerColoringEnabled) return false;

    const input = document.querySelector(TEXT_ANSWER_INPUT_SELECTOR);
    if (!input) return false;

    const question = getCurrentOpenEndedQuestion();
    if (!question) return false;

    const answerText = getFirstOpenEndedAnswer(question);
    if (!answerText) return false;

    // Solo se rellena una vez por pregunta. Si el usuario borra o cambia el
    // texto, no se vuelve a escribir encima.
    if (
      autoFilledOpenEndedQuestion === question &&
      autoFilledOpenEndedInput === input
    ) {
      return false;
    }

    const currentValue = String(input.value || "");
    if (currentValue && currentValue !== autoFilledOpenEndedValue) {
      // Hay texto que no escribió este script; se respeta.
      return false;
    }

    if (currentValue !== answerText) {
      input.click();
      input.focus();

      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      );
      if (!descriptor || typeof descriptor.set !== "function") return false;
      descriptor.set.call(input, answerText);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      console.log(
        `%c[KW Abierta]%c Respuesta escrita en Kahoot: %c${answerText}`,
        "color:#a855f7;font-weight:bold",
        "color:inherit",
        "color:#22c55e;font-weight:bold"
      );
    }

    autoFilledOpenEndedQuestion = question;
    autoFilledOpenEndedInput = input;
    autoFilledOpenEndedValue = answerText;
    return true;
  }

  function installAnswerColorObserver() {
    try {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "attributes") {
            const target = mutation.target;
            if (target && target.matches?.(PIN_IT_IMAGE_SELECTOR)) {
              scheduleAnswerPaint();
              return;
            }
            continue;
          }
          if (mutation.type !== "childList") continue;
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (
              node.matches?.(ANSWER_BUTTON_SELECTOR) ||
              node.querySelector?.(ANSWER_BUTTON_SELECTOR) ||
              node.matches?.(TEXT_ANSWER_INPUT_SELECTOR) ||
              node.querySelector?.(TEXT_ANSWER_INPUT_SELECTOR) ||
              node.matches?.(PIN_IT_IMAGE_SELECTOR) ||
              node.querySelector?.(PIN_IT_IMAGE_SELECTOR)
            ) {
              scheduleAnswerPaint();
              return;
            }
          }
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href", "src"],
      });
      window.__kwAnswerColorObserver = observer;

      // Kahoot puede reutilizar los mismos nodos entre preguntas y actualizar
      // solo su contenido. Este chequeo ligero garantiza que el color, el
      // overlay Pin It y el autocompletado de respuestas abiertas sigan
      // sincronizados con el índice actual.
      window.__kwAnswerColorInterval = setInterval(() => {
        detectMidGameStart();
        if (answerColoringEnabled) {
          paintKahootAnswerButtons();
          fillOpenEndedAnswer();
        }
        updatePinItOverlay();
      }, 25);
    } catch (_) { }
  }

  function renderAllQuestions() {
    clearAnswers();
    if (!questions.length) return;

    // Barra de búsqueda
    const searchWrapper = document.createElement("div");
    Object.assign(searchWrapper.style, {
      position: "relative",
      width: "100%",
      marginBottom: "6px",
      flexShrink: "0",
    });

    const searchIcon = document.createElement("span");
    searchIcon.textContent = "🔍";
    Object.assign(searchIcon.style, {
      position: "absolute",
      left: "10px",
      top: "46%",
      transform: "translateY(-50%)",
      fontSize: "14px",
      pointerEvents: "none",
      lineHeight: "1",
      marginTop: "-1px",
    });

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Buscar pregunta o respuesta…";
    searchInput.autocomplete = "off";
    Object.assign(searchInput.style, {
      width: "100%",
      boxSizing: "border-box",
      padding: "8px 12px 8px 34px",
      borderRadius: "8px",
      border: `1px solid ${colors.accent}`,
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      color: colors.text,
      fontSize: "13px",
      outline: "none",
      transition: "border-color 0.15s ease",
    });
    searchInput.addEventListener("focus", () => {
      searchInput.style.borderColor = colors.correct;
    });
    searchInput.addEventListener("blur", () => {
      searchInput.style.borderColor = colors.accent;
    });
    // Evitar que las teclas numéricas activen las respuestas de Kahoot mientras se escribe
    searchInput.addEventListener("keydown", (e) => { e.stopPropagation(); e.stopImmediatePropagation(); });
    searchInput.addEventListener("keyup", (e) => { e.stopPropagation(); e.stopImmediatePropagation(); });
    searchInput.addEventListener("keypress", (e) => { e.stopPropagation(); e.stopImmediatePropagation(); });

    searchWrapper.append(searchIcon, searchInput);
    answersContainer.appendChild(searchWrapper);

    // Mensaje de sin resultados
    const emptyMsg = document.createElement("div");
    emptyMsg.textContent = "Ninguna pregunta coincide con la búsqueda.";
    Object.assign(emptyMsg.style, {
      display: "none",
      color: "rgba(255,255,255,0.45)",
      fontSize: "13px",
      textAlign: "center",
      padding: "14px 0",
      flexShrink: "0",
    });

    // Crear tarjetas con datos normalizados para búsqueda
    const cards = questions.map((q, i) => {
      const card = createQuestionCard(i, q);

      // Indexar texto de pregunta
      const qNorm = normalizeText(q.questionText);

      // Indexar respuestas (correctTexts + answers)
      const answerTexts = [
        ...(q.correctTexts || []).map((e) =>
          typeof e === "object" ? (e.text || "") : (e || "")
        ),
        ...(q.answers || []),
      ];
      const aNorm = answerTexts.map(normalizeText).join(" ");

      card.dataset.searchIndex = `${qNorm} ${aNorm}`;
      answersContainer.appendChild(card);
      return card;
    });

    answersContainer.appendChild(emptyMsg);

    // Filtrado instantáneo
    searchInput.oninput = () => {
      const query = normalizeText(searchInput.value);
      let visibleCount = 0;
      cards.forEach((card) => {
        const matches = !query || card.dataset.searchIndex?.includes(query);
        card.style.display = matches ? "flex" : "none";
        if (matches) visibleCount++;
      });
      emptyMsg.style.display = visibleCount === 0 ? "block" : "none";
    };
  }

  // Lógica de arrastre
  let dragData = null;
  const dragThreshold = 5;

  header.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.closest("button") || e.target.closest("#kw-reopen-btn")) return;
    const rect = uiElement.getBoundingClientRect();
    dragData = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      dragging: false,
    };
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragData) return;
    const dx = Math.abs(e.clientX - dragData.startX);
    const dy = Math.abs(e.clientY - dragData.startY);
    if (!dragData.dragging && (dx > dragThreshold || dy > dragThreshold)) {
      dragData.dragging = true;
      uiElement.style.cursor = "grabbing";
      document.body.style.cursor = "grabbing";
      uiElement.style.userSelect = "none";
    }
    if (dragData.dragging) {
      const x = Math.max(
        0,
        Math.min(window.innerWidth - uiElement.offsetWidth, e.clientX - dragData.offsetX)
      );
      const y = Math.max(
        0,
        Math.min(window.innerHeight - uiElement.offsetHeight, e.clientY - dragData.offsetY)
      );
      requestAnimationFrame(() => {
        uiElement.style.left = `${x}px`;
        uiElement.style.top = `${y}px`;
      });
    }
  });

  document.addEventListener("mouseup", () => {
    if (dragData) {
      if (dragData.dragging) {
        uiElement.style.cursor = "";
        document.body.style.cursor = "";
        uiElement.style.userSelect = "";
      }
      dragData = null;
    }
  });

  // Visibilidad del menú
  let menuVisible = true;

  function setMenuVisible(visible) {
    menuVisible = visible;
    uiElement.style.opacity = visible ? "1" : "0";
    uiElement.style.pointerEvents = visible ? "auto" : "none";
    reopenBtn.style.display = visible ? "none" : "block";
  }

  function toggleMenuVisibility() {
    setMenuVisible(!menuVisible);
  }

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenuVisibility();
  });

  reopenBtn.addEventListener("click", () => {
    setMenuVisible(true);
  });

  let fetchToken = 0;

  const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const PIN_RE = /^\d{4,10}$/;

  function setStatus(text, color) {
    if (!text) {
      statusMsg.style.display = "none";
      statusMsg.textContent = "";
      return;
    }
    statusMsg.textContent = text;
    statusMsg.style.color = color || "rgba(255,255,255,0.6)";
    statusMsg.style.display = "block";
  }

  function fetchByUUID(quizID, token, deferToQ2 = false) {
    // kahoot.it/rest/kahoots/ es mismo origen cuando se ejecuta en kahoot.it
    // y acepta peticiones directas desde el navegador sin proxy.
    const url = `https://kahoot.it/rest/kahoots/${encodeURIComponent(quizID)}`;
    setStatus("Buscando detalles del quiz...", "rgba(120, 180, 255, 0.9)");

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("not_found");
        return r.json();
      })
      .then((data) => {
        if (token !== fetchToken) return;
        data.uuid = quizID;
        if (deferToQ2 && isWaitingForQ2) {
          pendingResolvedQuiz = data;
          // La lista completa no se muestra hasta Q2, pero las preguntas
          // deben estar disponibles ya para colorear la Pregunta 1.
          questions = parseQuestions(data.questions || []);
          scheduleAnswerPaint(25);
          updateQ1BannerResolved(data);
        } else {
          selectQuiz(data);
        }
      })
      .catch(() => {
        if (token !== fetchToken) return;
        quizIdInput.style.borderColor = colors.incorrect;
        setStatus("Quiz no encontrado o privado. Verifica el UUID.", colors.incorrect);
        if (!isWaitingForQ2) {
          questions = [];
          clearAnswers();
        } else {
          updateQ1BannerNone();
        }
      });
  }

  // ─── Protección contra suspensión en segundo plano (Keep-Alive) ───────
  // Los navegadores modernos (Chromium) suspenden el Event Loop y cierran
  // conexiones WebSockets inactivas cuando la pestaña queda en segundo plano
  // (por ejemplo, al cambiar a otra ventana con YouTube).
  //
  // Para evitar que el navegador suspenda la conexión implementamos:
  // 1. AudioContext silencioso (tono inaudible a 20Hz con ganancia 0.00001):
  //    Chromium clasifica automáticamente la pestaña como reproductora de audio,
  //    lo que la exime del congelamiento y de la restricción de timers.
  // 2. Web Worker en hilo independiente con latido continuo de 1 segundo:
  //    Los Web Workers no se ven afectados por el estrangulamiento del DOM y
  //    revisan periódicamente que el AudioContext permanezca activo.
  // 3. Interceptor universal de JSON.parse:
  //    Captura paquetes CometD tanto si vienen por WebSocket como por HTTP Long-Polling.
  // 4. Detección tardía por cualquier pregunta del quiz:
  //    Si el usuario vuelve tarde y ya inició la pregunta 1, 2 o posterior,
  //    el buscador identifica el quiz comparando con cualquier pregunta.

  let keepAliveCtx = null;
  let keepAliveWorker = null;

  function ensureBackgroundKeepAlive() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!keepAliveCtx) {
          keepAliveCtx = new AudioCtx();
          window.__kwKeepAliveCtx = keepAliveCtx;
          const osc = keepAliveCtx.createOscillator();
          const gain = keepAliveCtx.createGain();
          gain.gain.value = 0.00001; // Inaudible (~ -100 dB)
          osc.frequency.value = 20; // 20 Hz
          osc.connect(gain);
          gain.connect(keepAliveCtx.destination);
          osc.start();
        }
        if (keepAliveCtx.state === "suspended") {
          keepAliveCtx.resume().catch(() => { });
        }
      }
    } catch (_) { }

    if (!keepAliveWorker) {
      try {
        const blob = new Blob([
          "setInterval(function() { postMessage('kw-tick'); }, 1000);"
        ], { type: "application/javascript" });
        keepAliveWorker = new Worker(URL.createObjectURL(blob));
        window.__kwKeepAliveWorker = keepAliveWorker;
        keepAliveWorker.onmessage = function () {
          if (keepAliveCtx && keepAliveCtx.state === "suspended") {
            keepAliveCtx.resume().catch(() => { });
          }
        };
      } catch (_) { }
    }
  }

  // Activar Keep-Alive con cualquier interacción del usuario o retorno a la pestaña
  ["click", "keydown", "input", "pointerdown", "focus"].forEach((evt) => {
    window.addEventListener(evt, ensureBackgroundKeepAlive, { passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      ensureBackgroundKeepAlive();
    }
  });

  // ─── Interceptor universal de JSON.parse ──────────────────────────────
  // CometD (librería de Kahoot) desempaqueta todos los mensajes mediante
  // JSON.parse, tanto si vienen por WebSocket como si caen a HTTP Long-Polling.
  if (!window.__kwOrigJSONParse) {
    window.__kwOrigJSONParse = window.JSON.parse;
  }
  const origJSONParse = window.__kwOrigJSONParse;

  window.JSON.parse = function (...args) {
    const res = origJSONParse.apply(this, args);
    if (res && typeof res === "object") {
      try {
        if (Array.isArray(res)) {
          for (const item of res) {
            if (item?.data?.content) {
              let c = item.data.content;
              if (typeof c === "string") {
                try { c = origJSONParse(c); } catch (_) { }
              }
              if (c && typeof c === "object") {
                processKahootPayload(c);
              }
            }
          }
        } else {
          processKahootPayload(res);
        }
      } catch (_) { }
    }
    return res;
  };

  let fullQuizLoaded = false;
  let quizStartHandled = false;
  let isWaitingForQ2 = false;
  let knownTotalQuestions = null;
  let pendingResolvedQuiz = null;
  let pendingCandidateChoices = null;
  // Grupo de candidatos que superaron todos los filtros cuando eran 2 o más.
  // Se conserva intacto para poder volver al selector sin descartar al elegido.
  let filteredCandidateSurvivors = null;
  let searchInProgress = false;
  let q2CheckInterval = null;

  // Estado de "Mostrar respuestas en pantalla". El interruptor empieza
  // activado; los flags de Kahoot pueden desactivarlo automáticamente.
  // `answerColoringEnabled` es el estado efectivo para botones y Pin It.
  let showAnswersEnabled = true;
  let answerColoringEnabled = false;
  let randomFlagsAllowAnswers = false;
  let lastRandomFlagsAllowed = null;
  let lastRandomFlagsReason = "";
  let autoDisabledByRandomFlags = false;
  let manualOverrideRandomFlags = false;
  // Partida detectada ya empezada: no se han visto los flags de Kahoot, así
  // que no se puede saber si las preguntas están aleatorizadas. Se muestran
  // las respuestas igualmente, pero con un aviso naranja.
  let midGameDetected = false;
  let midGameCandidateSince = 0;
  // Modo challenge: no hay QuizStart ni contador de pregunta en el DOM.
  // El índice real se obtiene de `upToQuestion` en las peticiones
  // /rest/challenges/<id>/progress/?upToQuestion=N (0 = Pregunta 1).
  let challengeModeDetected = false;
  let challengeQuestionIndex = null;
  let firstQuestionBlock = null;
  let answerPaintTimer = null;
  let liveQuestionIndex = null;
  let liveQuestionType = null;
  let autoFilledOpenEndedQuestion = null;
  let autoFilledOpenEndedInput = null;
  let autoFilledOpenEndedValue = "";
  let firstBlockOpenEndedQuestion = null;
  let firstBlockOpenEndedSource = null;

  function updateAnswersDisplayMessage() {
    if (!answersDisplayMessage) return;

    let text = "";
    if (lastRandomFlagsAllowed === false) {
      const reason = lastRandomFlagsReason ||
        "las preguntas o las respuestas están aleatorizadas";

      if (showAnswersEnabled && manualOverrideRandomFlags) {
        text = `Advertencia: ${reason}. Has reactivado la opción manualmente; ` +
          "las respuestas marcadas podrían no ser las correctas.";
      } else if (!showAnswersEnabled && autoDisabledByRandomFlags) {
        text = `Se desactivó automáticamente porque ${reason}. ` +
          "Puedes volver a activarla, pero las respuestas marcadas podrían no coincidir.";
      }
    }

    if (answersDisplayMessage.textContent !== text) {
      answersDisplayMessage.textContent = text;
    }
    const display = text ? "block" : "none";
    if (answersDisplayMessage.style.display !== display) {
      answersDisplayMessage.style.display = display;
    }
  }

  function updateMidGameWarning() {
    if (!answersDisplayMidGameMessage) return;

    let text = "";
    if (midGameDetected && showAnswersEnabled && lastRandomFlagsAllowed === null) {
      text = "Advertencia: Se ha detectado que el quiz ya estaba en curso al momento de entrar. No es posible " +
        "determinar si las preguntas están aleatorizadas.";
    }

    if (answersDisplayMidGameMessage.textContent !== text) {
      answersDisplayMidGameMessage.textContent = text;
    }
    const display = text ? "block" : "none";
    if (answersDisplayMidGameMessage.style.display !== display) {
      answersDisplayMidGameMessage.style.display = display;
    }
  }

  function updateAnswersDisplayDefaultMessage() {
    if (!answersDisplayDefaultMessage) return;

    const hasWarning =
      (answersDisplayMessage?.textContent || "").length > 0 ||
      (answersDisplayMidGameMessage?.textContent || "").length > 0;
    const display = hasWarning ? "none" : "block";
    if (answersDisplayDefaultMessage.style.display !== display) {
      answersDisplayDefaultMessage.style.display = display;
    }
  }

  function syncAnswersDisplayUI() {
    if (!answersDisplayToggle) return;

    const on = showAnswersEnabled;
    answersDisplayToggle.setAttribute("aria-checked", on ? "true" : "false");
    answersDisplayToggle.style.backgroundColor = on
      ? colors.correct
      : "rgba(255, 255, 255, 0.18)";
    answersDisplayToggle.style.borderColor = on
      ? "rgba(255, 255, 255, 0.35)"
      : "rgba(255, 255, 255, 0.22)";
    answersDisplayToggleKnob.style.transform = on
      ? "translateX(20px)"
      : "translateX(0)";

    updateAnswersDisplayMessage();
    updateMidGameWarning();
    updateAnswersDisplayDefaultMessage();
  }

  function refreshAnswersDisplayState() {
    // En challenge no llega QuizStart con gameOptions. Mientras no se hayan
    // visto flags reales, el índice de upToQuestion nos permite colorear con
    // un aviso; si más adelante llegan flags, esos tienen prioridad.
    const challengeAllows =
      challengeModeDetected && lastRandomFlagsAllowed === null;

    answerColoringEnabled = showAnswersEnabled &&
      (randomFlagsAllowAnswers || manualOverrideRandomFlags || midGameDetected || challengeAllows);

    syncAnswersDisplayUI();

    if (answerColoringEnabled) {
      scheduleAnswerPaint(10);
    } else {
      resetPaintedAnswerButtons();
      removePinItOverlay();
    }
  }

  // Si el script se inyecta con la partida ya empezada no llega el QuizStart
  // con gameOptions. En ese caso usamos el contador de pregunta del DOM para
  // confirmar que hay una partida activa y mostramos las respuestas con aviso.
  function detectMidGameStart() {
    if (midGameDetected) return;

    if (!showAnswersEnabled || lastRandomFlagsAllowed !== null) {
      midGameCandidateSince = 0;
      return;
    }

    // Sin preguntas cargadas no hay nada que pintar; el aviso aparecerá en
    // cuanto el quiz esté disponible y siga sin haber flags.
    if (!questions.length || readDomQuestionIndex() === null) {
      midGameCandidateSince = 0;
      return;
    }

    // Pequeña espera para no confundir un QuizStart que está a punto de
    // llegar con una partida ya empezada.
    if (!midGameCandidateSince) {
      midGameCandidateSince = Date.now();
      return;
    }
    if (Date.now() - midGameCandidateSince < 1000) return;

    midGameDetected = true;
    midGameCandidateSince = 0;
    console.log(
      "%c[KW Live]%c Partida ya empezada detectada; no se pueden leer " +
      "randomAnswers/randomQuestions. Mostrando respuestas con aviso.",
      "color:#f59e0b;font-weight:bold;",
      "color:inherit"
    );
    refreshAnswersDisplayState();
  }

  function handleAnswersDisplayToggle() {
    showAnswersEnabled = !showAnswersEnabled;

    if (showAnswersEnabled) {
      // Si los flags están bloqueados, reactivar es un override manual.
      manualOverrideRandomFlags = lastRandomFlagsAllowed === false;
    } else {
      manualOverrideRandomFlags = false;
      autoDisabledByRandomFlags = false;
    }

    refreshAnswersDisplayState();
  }

  // Sincroniza la UI con el estado inicial (activado, sin flags conocidos).
  refreshAnswersDisplayState();

  // Almacenamiento en caché de candidatos para esperar totalGameBlockCount antes de comprobar
  let cachedCandidateSearchResults = null;
  let cachedTargetBlock = null;
  let cachedSearchToken = 0;
  let cachedDeferToQ2 = false;
  let cachedIsAnyQuestion = false;

  function resetQuizDetectionState() {
    fullQuizLoaded = false;
    quizStartHandled = false;
    isWaitingForQ2 = false;
    knownTotalQuestions = null;
    pendingResolvedQuiz = null;
    pendingCandidateChoices = null;
    filteredCandidateSurvivors = null;
    setSelectAnotherCandidateVisible(false);
    cachedCandidateSearchResults = null;
    cachedTargetBlock = null;
    searchInProgress = false;
    firstQuestionBlock = null;
    if (autoDisabledByRandomFlags) {
      // Si estaba apagado por los flags, un nuevo quiz vuelve al valor
      // por defecto. Si el usuario lo apagó a mano, se respeta.
      showAnswersEnabled = true;
    }
    autoDisabledByRandomFlags = false;
    manualOverrideRandomFlags = false;
    randomFlagsAllowAnswers = false;
    lastRandomFlagsAllowed = null;
    lastRandomFlagsReason = "";
    midGameDetected = false;
    midGameCandidateSince = 0;
    // El modo challenge describe la página, no el quiz buscado: una búsqueda
    // manual no debe apagarlo. Un QuizStart real sí lo limpia.
    answerColoringEnabled = false;
    liveQuestionIndex = null;
    liveQuestionType = null;
    autoFilledOpenEndedQuestion = null;
    autoFilledOpenEndedInput = null;
    autoFilledOpenEndedValue = "";
    firstBlockOpenEndedQuestion = null;
    firstBlockOpenEndedSource = null;
    if (answerPaintTimer) {
      clearTimeout(answerPaintTimer);
      answerPaintTimer = null;
    }
    resetPaintedAnswerButtons();
    removePinItOverlay();
    syncAnswersDisplayUI();
    if (q2CheckInterval) {
      clearInterval(q2CheckInterval);
      q2CheckInterval = null;
    }
  }

  function isQuestion2OrScoreboard(payload) {
    if (!payload || typeof payload !== "object") return false;
    if (typeof payload.gameBlockIndex === "number" && payload.gameBlockIndex >= 1) return true;
    if (typeof payload.questionIndex === "number" && payload.questionIndex >= 1) return true;
    const layout = String(payload.layout || "").toUpperCase();
    if (layout.includes("SCORE") || layout.includes("PODIUM")) return true;
    const gbType = String(payload.gameBlockType || "").toLowerCase();
    if (gbType.includes("score") || gbType.includes("podium")) return true;
    const pType = String(payload.type || "").toLowerCase();
    if (pType.includes("scoreboard") || pType.includes("podium")) return true;
    return false;
  }

  function handleTotalGameBlockCount(count) {
    if (typeof count !== "number" || count <= 0) return;
    if (knownTotalQuestions === count) return;
    knownTotalQuestions = count;
    console.log(
      `%c[KW Paquete 2]%c Total exacto de preguntas detectado: %c${count} preguntas%c.`,
      "color:#a855f7;font-weight:bold",
      "color:inherit",
      "color:#38bdf8;font-weight:bold",
      "color:inherit"
    );

    // Si los candidatos de la API ya estaban en caché esperando totalGameBlockCount:
    if (cachedCandidateSearchResults && cachedCandidateSearchResults.length > 0) {
      console.log(
        `%c[KW Filtro]%c Iniciando comprobación única de los 5 filtros con ${count} preguntas para los ${cachedCandidateSearchResults.length} candidatos...`,
        "color:#22c55e;font-weight:bold",
        "color:inherit"
      );
      const list = cachedCandidateSearchResults;
      const block = cachedTargetBlock;
      const token = cachedSearchToken;
      const defer = cachedDeferToQ2;
      const isAny = cachedIsAnyQuestion;
      cachedCandidateSearchResults = null;
      cachedTargetBlock = null;

      checkCandidates(list, block, count, token, isAny, defer);
    }
  }

  // ─── Modo challenge: índice de pregunta vía upToQuestion ──────────────
  // En challenge no existe QuizStart ni el contador de pregunta del DOM.
  // Kahoot solicita /rest/challenges/<id>/progress/?upToQuestion=N en cada
  // avance, donde N=0 es la Pregunta 1, N=1 la Pregunta 2, etc. Esa URL es
  // nuestra fuente autoritativa del bloque actual.
  const CHALLENGE_PROGRESS_RE =
    /\/rest\/challenges\/[^/?#]+\/progress\/?(?:[?#]|$)/i;

  function handleChallengeProgressUrl(url) {
    try {
      if (typeof url !== "string" || !url) return;
      if (!CHALLENGE_PROGRESS_RE.test(url)) return;

      const match = url.match(/[?&]upToQuestion=(\d+)/i);
      if (!match) return;
      const index = parseInt(match[1], 10);
      if (!Number.isInteger(index) || index < 0) return;

      const firstDetection = !challengeModeDetected;
      const indexChanged = challengeQuestionIndex !== index;
      challengeModeDetected = true;
      challengeQuestionIndex = index;

      if (firstDetection) {
        // El respaldo de "partida ya empezada" no sirve aquí: se basa en el
        // contador del DOM, que challenge no muestra.
        midGameDetected = false;
        midGameCandidateSince = 0;
        console.log(
          `%c[KW Challenge]%c Índice obtenido de upToQuestion: ` +
          `%cPregunta ${index + 1}%c. ` +
          (showAnswersEnabled
            ? "Mostrando respuestas en pantalla."
            : "La opción de respuestas está desactivada."),
          "color:#a855f7;font-weight:bold",
          "color:inherit",
          "color:#38bdf8;font-weight:bold",
          "color:inherit"
        );
        setStatus(
          "Modo challenge: índice de pregunta detectado por upToQuestion.",
          "rgba(120, 180, 255, 0.9)"
        );
      } else if (indexChanged) {
        console.log(
          `%c[KW Challenge]%c upToQuestion=${index} → Pregunta ${index + 1}.`,
          "color:#a855f7;font-weight:bold",
          "color:inherit"
        );
      }

      if (firstDetection || indexChanged) {
        refreshAnswersDisplayState();
        scheduleAnswerPaint(25);
      }
    } catch (_) { }
  }

  // Instala la captura de las peticiones de progreso de challenge. Se parchean
  // fetch y XHR, y se usa PerformanceObserver con buffered:true como respaldo
  // por si alguna petición ocurrió antes de instalar los parches.
  function installChallengeProgressWatcher() {
    try {
      if (window.__kwChallengePerfObserver) {
        try { window.__kwChallengePerfObserver.disconnect(); } catch (_) { }
        window.__kwChallengePerfObserver = null;
      }

      // Los parches de red son globales y sobreviven a una reinyección del
      // script. El handler se guarda en window para que el parche llame
      // siempre a la instancia más reciente.
      window.__kwChallengeProgressHandler = handleChallengeProgressUrl;

      // 1. fetch
      const wrapFetch = (targetFetch) => {
        if (typeof targetFetch !== "function") return;
        const patchedFetch = function (...args) {
          try {
            const input = args[0];
            const url = typeof input === "string"
              ? input
              : (input && (input.url || input.href)) || "";
            const handler = window.__kwChallengeProgressHandler;
            if (typeof handler === "function") handler(url);
          } catch (_) { }
          return targetFetch.apply(window, args);
        };
        window.__kwChallengeFetchWrapper = patchedFetch;
        window.fetch = patchedFetch;
      };
      if (!window.__kwChallengeFetchWrapper) {
        wrapFetch(window.fetch);
      } else if (window.fetch !== window.__kwChallengeFetchWrapper) {
        // Otro script reemplazó fetch después de nosotros: envolvemos el
        // fetch actual para no perder la captura.
        wrapFetch(window.fetch);
      }

      // 2. XMLHttpRequest
      if (typeof XMLHttpRequest === "function") {
        const wrapXhrOpen = (targetOpen) => {
          if (typeof targetOpen !== "function") return;
          const patchedOpen = function (method, url, ...rest) {
            try {
              const handler = window.__kwChallengeProgressHandler;
              if (typeof handler === "function") {
                handler(typeof url === "string" ? url : String(url || ""));
              }
            } catch (_) { }
            return targetOpen.call(this, method, url, ...rest);
          };
          window.__kwChallengeXhrOpenWrapper = patchedOpen;
          XMLHttpRequest.prototype.open = patchedOpen;
        };
        if (!window.__kwChallengeXhrOpenWrapper) {
          wrapXhrOpen(XMLHttpRequest.prototype.open);
        } else if (XMLHttpRequest.prototype.open !== window.__kwChallengeXhrOpenWrapper) {
          wrapXhrOpen(XMLHttpRequest.prototype.open);
        }
      }

      // 3. Respaldo: Resource Timing (incluye peticiones ya completadas)
      if (typeof PerformanceObserver === "function") {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              handleChallengeProgressUrl(entry.name);
            }
          });
          observer.observe({ type: "resource", buffered: true });
          window.__kwChallengePerfObserver = observer;
        } catch (_) { }
      }
    } catch (_) { }
  }

  function processKahootPayload(payload) {
    if (!payload || typeof payload !== "object") return;

    // El paquete QuizStart incluye gameOptions.randomAnswers/randomQuestions.
    // Solo habilitamos el coloreado si ambos son false.
    updateAnswerColoringState(payload);
    if (payload.firstGameBlockData) {
      firstQuestionBlock = payload.firstGameBlockData;
      // firstGameBlockData identifica el inicio del quiz: Q1.
      liveQuestionIndex = 0;
    }

    // Tipo del bloque actual. gameBlockType es la fuente principal; para
    // QuizStart preferimos firstGameBlockData.type, que distingue pin_it de
    // quiz. La presencia de choiceShapes también identifica un Pin It.
    const firstBlockType = payload.firstGameBlockData &&
      typeof payload.firstGameBlockData.type === "string"
      ? payload.firstGameBlockData.type.trim().toLowerCase()
      : "";
    if (firstBlockType) {
      liveQuestionType = firstBlockType;
    } else if (
      typeof payload.gameBlockType === "string" &&
      payload.gameBlockType.trim()
    ) {
      liveQuestionType = payload.gameBlockType.trim().toLowerCase();
    }
    if (
      payload.firstGameBlockData &&
      Array.isArray(payload.firstGameBlockData.choiceShapes) &&
      payload.firstGameBlockData.choiceShapes.length
    ) {
      liveQuestionType = "pin_it";
    }
    const payloadLayout = String(payload.layout || "").toUpperCase();
    const payloadType = String(payload.type || "").toLowerCase();
    if (
      payloadLayout.includes("SCORE") ||
      payloadLayout.includes("PODIUM") ||
      payloadType.includes("scoreboard") ||
      payloadType.includes("podium")
    ) {
      liveQuestionType = "scoreboard";
    }

    // QuestionReady/QuestionStart traen el índice real del bloque.
    // gameBlockIndex incluye los bloques de contenido, igual que el array
    // questions[] del REST; questionIndex se usa como respaldo.
    const readPacketIndex = (value) => {
      if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
      if (typeof value === "string" && /^\d+$/.test(value)) return parseInt(value, 10);
      return null;
    };
    const packetBlockIndex = readPacketIndex(payload.gameBlockIndex);
    const packetQuestionIndex = readPacketIndex(payload.questionIndex);
    const packetIndex = packetBlockIndex !== null ? packetBlockIndex : packetQuestionIndex;
    if (packetIndex !== null) {
      liveQuestionIndex = packetIndex;
    }

    scheduleAnswerPaint(25);

    // 1. Extraer totalGameBlockCount en cualquier paquete que lo traiga (Paquete 2)
    if (typeof payload.totalGameBlockCount === "number" && payload.totalGameBlockCount > 0) {
      handleTotalGameBlockCount(payload.totalGameBlockCount);
    }

    // 2. Si ya tenemos todas las preguntas del quiz completo desplegadas, omitir
    if (fullQuizLoaded) return;

    // 3. Si estamos en modo de espera con la Pregunta 1 en pantalla y este paquete
    //    indica avance a Pregunta 2 o Scoreboard
    if (isWaitingForQ2 && isQuestion2OrScoreboard(payload)) {
      transitionToFullQuiz();
      return;
    }

    // 4. Caso 1: Inicio formal de quiz con firstGameBlockData (QuizStart)
    if (!quizStartHandled && payload.firstGameBlockData?.question) {
      quizStartHandled = true;
      onQuizStartDetected(payload);
      return;
    }

    // 5. Caso 2: Objeto quiz con ID directo (UUID) en el contenido
    if (!quizStartHandled && payload.type === "quiz" && (payload.quizId || payload.uuid) && payload.firstGameBlockData) {
      const id = payload.quizId || payload.uuid;
      if (UUID_RE.test(id)) {
        quizStartHandled = true;
        liveQuestionIndex = 0;
        renderFirstQuestionImmediate(payload.firstGameBlockData);
        startWaitingForQ2();
        setStatus("Quiz identificado por UUID. Cargando respuestas completas…", "rgba(120, 180, 255, 0.9)");
        fetchByUUID(id, ++fetchToken, true);
      }
      return;
    }

    // 6. Caso 3 — Modo Challenge: el paquete incluye kahootId directamente.
    //    Detectable por la presencia de kahootId (UUID) en el payload, o bien porque
    //    la URL contiene /solo/ (ruta exclusiva del modo challenge/solo de Kahoot).
    if (!quizStartHandled) {
      const challengeId = payload.kahootId;
      if (UUID_RE.test(challengeId)) {
        quizStartHandled = true;
        // Modo challenge confirmado. No hay QuizStart ni contador en el DOM,
        // así que el coloreado se apoya en upToQuestion. Si aún no hemos
        // visto la URL de progreso, asumimos la Pregunta 1; el observador de
        // red corregirá el índice en cuanto llegue la petición real.
        challengeModeDetected = true;
        if (challengeQuestionIndex === null) {
          challengeQuestionIndex = 0;
        }
        midGameDetected = false;
        midGameCandidateSince = 0;
        refreshAnswersDisplayState();
        const isChallengeUrl = window.location.pathname.includes("/solo/");
        console.log(
          `%c[KW Challenge]%c Modo challenge detectado (${isChallengeUrl ? "URL /solo/" : "campo kahootId"}). ` +
          `Cargando quiz directamente: %c${challengeId}`,
          "color:#a855f7;font-weight:bold",
          "color:inherit",
          "color:#38bdf8;font-style:italic"
        );
        setStatus("Modo challenge detectado. Cargando respuestas…", "rgba(120, 180, 255, 0.9)");
        fetchByUUID(challengeId, ++fetchToken, false);
      }
    }
  }

  // ─── Interceptor de WebSocket ─────────────────────────────────────────
  // Captura mensajes del WebSocket de Kahoot sin importar si el script se
  // inyectó antes o después de unirse a la partida.

  function handleKahootWsMessage(rawData) {
    try {
      const arr = origJSONParse(rawData);
      if (!Array.isArray(arr)) return;
      for (const msg of arr) {
        const raw = msg?.data?.content;
        if (typeof raw !== "string") continue;
        let payload;
        try { payload = origJSONParse(raw); } catch (_) { continue; }
        if (payload && typeof payload === "object") {
          processKahootPayload(payload);
        }
      }
    } catch (_) { }
  }

  // Añade el listener a un WebSocket si es de Kahoot y no lo tiene ya
  function patchWs(ws, OrigWS) {
    if (!ws || !(ws instanceof OrigWS) || ws.__kwPatched) return false;
    if (ws.readyState === OrigWS.CLOSED || ws.readyState === OrigWS.CLOSING) return false;
    ws.__kwPatched = true;
    ws.addEventListener("message", (e) => handleKahootWsMessage(e.data));
    return true;
  }

  // Escaneo superficial de window en busca de WebSockets abiertos
  function scanWindowForWs(OrigWS) {
    let found = 0;
    try {
      for (const key of Object.getOwnPropertyNames(window)) {
        try {
          const val = window[key];
          if (val && typeof val === "object") {
            if (patchWs(val, OrigWS)) { found++; continue; }
            for (const k2 of Object.keys(val)) {
              try { if (patchWs(val[k2], OrigWS)) found++; } catch (_) { }
            }
          }
        } catch (_) { }
      }
    } catch (_) { }
    return found;
  }

  // Escaneo del árbol de fibras React para encontrar WebSockets en el estado
  function scanReactFiberForWs(OrigWS) {
    let found = 0;
    try {
      const roots = ["#root", "#app", "#__next", "[data-reactroot]"];
      let el = null;
      for (const sel of roots) { el = document.querySelector(sel); if (el) break; }
      if (!el) return 0;
      const fiberKey = Object.keys(el).find(
        (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
      );
      if (!fiberKey) return 0;
      let fiber = el[fiberKey];
      let visited = 0;
      const queue = [fiber];
      while (queue.length && visited < 2000) {
        const f = queue.shift();
        if (!f) continue;
        visited++;
        let s = f.memoizedState;
        while (s) {
          try { if (patchWs(s.memoizedState, OrigWS)) found++; } catch (_) { }
          s = s.next;
        }
        try {
          const p = f.memoizedProps;
          if (p && typeof p === "object") {
            for (const k of Object.keys(p)) {
              try { if (patchWs(p[k], OrigWS)) found++; } catch (_) { }
            }
          }
        } catch (_) { }
        if (f.child) queue.push(f.child);
        if (f.sibling) queue.push(f.sibling);
      }
    } catch (_) { }
    return found;
  }

  function installWebSocketInterceptor() {
    if (window.__kwInterceptorInstalled) return;
    window.__kwInterceptorInstalled = true;

    const OrigWS = window.WebSocket;

    // ── Estrategia 1: Proxy para WebSockets NUEVOS ─────────────────────
    window.WebSocket = new Proxy(OrigWS, {
      construct(Target, args) {
        const ws = new Target(...args);
        const url = args[0] ? String(args[0]) : "";
        if (url.includes("kahoot")) {
          ws.__kwPatched = true;
          ws.addEventListener("message", (e) => handleKahootWsMessage(e.data));
        }
        return ws;
      },
    });

    // ── Estrategia 2: Patch de prototype.addEventListener ───────────────
    const origAddEL = OrigWS.prototype.addEventListener;
    OrigWS.prototype.addEventListener = function (type, listener, opts) {
      if (!this.__kwPatched) {
        const url = this.url || "";
        if (url.includes("kahoot")) {
          this.__kwPatched = true;
          origAddEL.call(this, "message", (e) => handleKahootWsMessage(e.data));
        }
      }
      return origAddEL.call(this, type, listener, opts);
    };

    // ── Estrategia 3: Escaneo de conexiones ya existentes ───────────────
    let totalFound = scanWindowForWs(OrigWS) + scanReactFiberForWs(OrigWS);

    const msg = totalFound
      ? `Interceptor WS activo + ${totalFound} conexión(es) existente(s) parcheada(s).`
      : "Interceptor WS activo (no se encontraron conexiones previas).";
    console.log(`%c[KW]%c ${msg}`, "color:#a855f7;font-weight:bold", "color:inherit");
  }

  function extractTargetBlock(target) {
    if (typeof target === "string") {
      return {
        question: target,
        choices: [],
        image: "",
        imageMetadata: null,
        time: null,
        type: null,
        randomQuestions: false,
        randomAnswers: false,
      };
    }
    const block = target.firstGameBlockData || target.gameBlock || target.question || target || {};
    const qText = typeof block === "string" ? block : (block.question || target.question || "");

    const isRandomQ =
      typeof target.randomQuestions === "boolean"
        ? target.randomQuestions
        : (typeof target.gameOptions?.randomQuestions === "boolean"
          ? target.gameOptions.randomQuestions
          : (typeof block.randomQuestions === "boolean"
            ? block.randomQuestions
            : (typeof block.gameOptions?.randomQuestions === "boolean"
              ? block.gameOptions.randomQuestions
              : false)));

    const isRandomA =
      typeof target.randomAnswers === "boolean"
        ? target.randomAnswers
        : (typeof target.gameOptions?.randomAnswers === "boolean"
          ? target.gameOptions.randomAnswers
          : (typeof block.randomAnswers === "boolean"
            ? block.randomAnswers
            : (typeof block.gameOptions?.randomAnswers === "boolean"
              ? block.gameOptions.randomAnswers
              : false)));

    return {
      question: qText,
      choices: Array.isArray(block.choices) ? block.choices : [],
      image: block.image || "",
      imageMetadata: block.imageMetadata || null,
      time: block.time || null,
      type: block.type || null,
      pointsMultiplier: block.pointsMultiplier,
      randomQuestions: isRandomQ,
      randomAnswers: isRandomA,
      gameOptions: target.gameOptions || block.gameOptions || null,
    };
  }

  function detectTotalQuestionsFromDOM() {
    try {
      const counterEl = document.querySelector('[data-functional-selector="question-index-counter"]');
      if (counterEl) {
        const parentText = counterEl.parentElement?.textContent || "";
        const m = parentText.match(/\b\d+\s*(?:de|\/|of)\s*(\d+)\b/i);
        if (m) return parseInt(m[1], 10);
      }
      const candidates = document.querySelectorAll(
        'header, [data-functional-selector*="header"], [class*="header"], [data-functional-selector*="counter"]'
      );
      for (const el of candidates) {
        const m = el.textContent?.match(/\b\d+\s*(?:de|\/|of)\s*(\d+)\b/i);
        if (m) return parseInt(m[1], 10);
      }
    } catch (_) { }
    return null;
  }

  function evaluateCandidate(quiz, targetBlock, totalExpected, isAnyQuestion) {
    if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      return { matched: false, stepFailed: 1, reason: "Quiz vacío o sin preguntas" };
    }

    // Paso 5: Total exacto de preguntas
    // Dado que la comprobación solo corre cuando se tiene totalGameBlockCount,
    // se descarta de inmediato cualquier quiz con número de preguntas diferente.
    if (totalExpected !== null && totalExpected !== undefined) {
      if (quiz.questions.length !== totalExpected) {
        return {
          matched: false,
          stepFailed: 5,
          reason: `Total de preguntas diferente (tiene ${quiz.questions.length}, esperado ${totalExpected})`,
        };
      }
    }

    // Si randomQuestions es true en el juego, las preguntas vienen en orden aleatorio.
    // En ese caso se invalida la restricción de que deba coincidir con la Pregunta 1 del quiz,
    // y se busca la pregunta coincidente en cualquiera de las preguntas del quiz.
    // Si randomQuestions es false, el orden es fijo y la pregunta DEBE ser la primera (quiz.questions[0]).
    const isRandomOrder = isAnyQuestion || !!targetBlock.randomQuestions;
    const questionsToCheck = isRandomOrder ? quiz.questions : [quiz.questions[0]];

    let bestFailReason = isRandomOrder
      ? "La pregunta no coincide con ninguna de las preguntas del quiz"
      : "La pregunta no coincide con la Pregunta 1 del quiz (orden fijo: randomQuestions = false)";
    let bestStepFailed = 1;

    for (const q of questionsToCheck) {
      if (!q || !q.question) continue;

      // Paso 1: Filtro de Texto
      const cleanQ = q.question.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      const cleanTarget = (targetBlock.question || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      if (cleanQ !== cleanTarget) continue;

      // Paso 2: Filtro de Opciones de respuesta (choices)
      if (Array.isArray(targetBlock.choices) && targetBlock.choices.length > 0) {
        if (!Array.isArray(q.choices) || q.choices.length !== targetBlock.choices.length) {
          bestFailReason = `Cantidad de opciones diferente (${q.choices?.length || 0} vs ${targetBlock.choices.length})`;
          bestStepFailed = 2;
          continue;
        }

        const qAnswers = q.choices.map((c) =>
          (c.answer || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().toLowerCase()
        );
        const targetAnswers = targetBlock.choices.map((c) =>
          (c.answer || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().toLowerCase()
        );
        const allPresent = targetAnswers.every((ans) => qAnswers.includes(ans));
        if (!allPresent) {
          bestFailReason = "Las opciones de respuesta no coinciden con las del juego";
          bestStepFailed = 2;
          continue;
        }

        // Verificar corrección de opciones
        let correctMatch = true;
        for (const tc of targetBlock.choices) {
          const targetCleanText = (tc.answer || "")
            .replace(/<[^>]+>/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
          const qc = q.choices.find(
            (c) =>
              (c.answer || "")
                .replace(/<[^>]+>/g, "")
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase() === targetCleanText
          );
          if (qc && typeof tc.correct === "boolean" && typeof qc.correct === "boolean") {
            if (qc.correct !== tc.correct) {
              correctMatch = false;
              break;
            }
          }
        }
        if (!correctMatch) {
          bestFailReason = "El estado correcto/incorrecto de las respuestas no coincide";
          bestStepFailed = 2;
          continue;
        }
      }

      // Paso 3: Filtro de Imagen (imageMetadata.id o URL)
      const targetImgId =
        targetBlock.imageMetadata?.id ||
        (targetBlock.image ? targetBlock.image.split("/").pop().replace("_opt", "") : null);
      const qImgId =
        q.imageMetadata?.id ||
        (q.image ? q.image.split("/").pop().replace("_opt", "") : null);
      if (targetImgId) {
        if (!qImgId || (!targetImgId.includes(qImgId) && !qImgId.includes(targetImgId))) {
          bestFailReason = `Imagen diferente (ID quiz: ${qImgId || "sin imagen"} vs juego: ${targetImgId})`;
          bestStepFailed = 3;
          continue;
        }
      }

      // Paso 4: Filtro de Tiempo límite (time) y Tipo
      if (targetBlock.time && q.time) {
        if (q.time !== targetBlock.time) {
          bestFailReason = `Tiempo límite diferente (${q.time / 1000}s vs ${targetBlock.time / 1000}s)`;
          bestStepFailed = 4;
          continue;
        }
      }

      if (targetBlock.type && q.type) {
        if (q.type !== targetBlock.type) {
          bestFailReason = `Tipo de pregunta diferente (${q.type} vs ${targetBlock.type})`;
          bestStepFailed = 4;
          continue;
        }
      }

      // ¡Superó todos los filtros evaluados!
      return { matched: true, matchingQuestion: q };
    }

    return { matched: false, stepFailed: bestStepFailed, reason: bestFailReason };
  }

  function renderFirstQuestionImmediate(block) {
    firstQuestionBlock = block;
    clearAnswers();

    // Banner superior estilizado para Pregunta 1
    const banner = document.createElement("div");
    banner.id = "kw-q1-banner";
    Object.assign(banner.style, {
      backgroundColor: "rgba(22, 14, 38, 0.95)",
      border: "1px solid rgba(168, 85, 247, 0.5)",
      borderRadius: "10px",
      padding: "12px 14px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "10px",
      boxShadow: "0 4px 14px rgba(0, 0, 0, 0.4)",
      flexShrink: "0",
    });

    const infoSide = document.createElement("div");
    Object.assign(infoSide.style, {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      flex: "1 1 auto",
    });

    const badgeRow = document.createElement("div");
    Object.assign(badgeRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
    });

    const pulseDot = document.createElement("span");
    Object.assign(pulseDot.style, {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      backgroundColor: "#22c55e",
      boxShadow: "0 0 8px #22c55e",
      display: "inline-block",
    });

    const badgeText = document.createElement("span");
    badgeText.textContent = "PREGUNTA 1 ACTIVA";
    Object.assign(badgeText.style, {
      color: "#22c55e",
      fontSize: "11px",
      fontWeight: "800",
      letterSpacing: "0.8px",
    });

    badgeRow.append(pulseDot, badgeText);

    const bannerMsg = document.createElement("div");
    bannerMsg.id = "kw-q1-banner-msg";
    bannerMsg.textContent = "Respuesta correcta visible abajo. Buscando quiz completo de fondo…";
    Object.assign(bannerMsg.style, {
      color: "rgba(255, 255, 255, 0.85)",
      fontSize: "12px",
      lineHeight: "1.3",
    });

    infoSide.append(badgeRow, bannerMsg);

    const actionBtn = document.createElement("button");
    actionBtn.id = "kw-q1-action-btn";
    actionBtn.type = "button";
    actionBtn.textContent = "Mostrar ya";
    Object.assign(actionBtn.style, {
      padding: "6px 12px",
      borderRadius: "6px",
      border: "1px solid rgba(168, 85, 247, 0.7)",
      background: "linear-gradient(135deg, rgba(120, 80, 255, 0.4), rgba(168, 85, 247, 0.4))",
      color: "#ffffff",
      fontSize: "11px",
      fontWeight: "700",
      cursor: "pointer",
      whiteSpace: "nowrap",
      transition: "all 0.15s ease",
      opacity: "0.5",
      pointerEvents: "none",
    });

    actionBtn.addEventListener("mouseenter", () => {
      actionBtn.style.transform = "scale(1.04)";
      actionBtn.style.borderColor = colors.correct;
    });
    actionBtn.addEventListener("mouseleave", () => {
      actionBtn.style.transform = "scale(1)";
      actionBtn.style.borderColor = "rgba(168, 85, 247, 0.7)";
    });
    actionBtn.addEventListener("click", () => {
      transitionToFullQuiz();
    });

    banner.append(infoSide, actionBtn);
    answersContainer.appendChild(banner);

    // Preparar objeto de Pregunta 1
    const parsedQ1 = {
      type: block.layout === "TRUE_FALSE" ? "true_false" : (block.type || "quiz"),
      time: block.time,
      questionText: block.question || "",
      correctTexts: [],
      correctIndexes: [],
      incorrectIndexes: [],
      answers: [],
      image: block.image || "",
      imageWidth: block.imageMetadata?.width || 0,
      imageHeight: block.imageMetadata?.height || 0,
      choiceShapes: block.choiceShapes || [],
    };

    if (Array.isArray(block.choices)) {
      block.choices.forEach((c, choiceIndex) => {
        if (c.correct) {
          parsedQ1.correctTexts.push({
            text: c.answer ?? null,
            imageId: c.image?.id ?? null,
          });
          parsedQ1.correctIndexes.push(choiceIndex);
        } else {
          parsedQ1.incorrectIndexes.push(choiceIndex);
        }
      });
      if (["open_ended", "jumble"].includes(parsedQ1.type)) {
        parsedQ1.answers = block.choices.map((c) => c.answer);
      }
    }

    const card = createQuestionCard(0, parsedQ1);
    answersContainer.appendChild(card);
    scheduleAnswerPaint(25);
  }

  function updateQ1BannerResolved(quiz, options = {}) {
    const bannerMsg = document.getElementById("kw-q1-banner-msg");
    const actionBtn = document.getElementById("kw-q1-action-btn");
    const title = quiz.title || quiz.uuid;
    const detail = options.skippedFilters
      ? "Es el único resultado de la API, así que se aceptó sin filtros."
      : "Haz clic en el botón para ver las respuestas.";

    if (bannerMsg) {
      bannerMsg.innerHTML = `Quiz identificado: <b>"${title}"</b>. ${detail}`;
      bannerMsg.style.color = "rgba(120, 255, 180, 0.95)";
    }
    if (actionBtn) {
      actionBtn.style.display = "";
      actionBtn.textContent = "Ver todas ya";
      actionBtn.style.opacity = "1";
      actionBtn.style.pointerEvents = "auto";
      actionBtn.style.background = "linear-gradient(135deg, #7c3aed, #22c55e)";
    }
  }

  function updateQ1BannerCandidates(candidates) {
    const bannerMsg = document.getElementById("kw-q1-banner-msg");
    const actionBtn = document.getElementById("kw-q1-action-btn");

    if (bannerMsg) {
      bannerMsg.innerHTML = `Se encontraron <b>${candidates.length} quizzes</b> que podrian ser el que buscas. Tendras que elegir manualmente.`;
      bannerMsg.style.color = "rgba(255, 205, 85, 0.95)";
    }
    if (actionBtn) {
      actionBtn.style.display = "";
      actionBtn.textContent = "Elegir quiz ya";
      actionBtn.style.opacity = "1";
      actionBtn.style.pointerEvents = "auto";
      actionBtn.style.background = "linear-gradient(135deg, #7c3aed, #f59e0b)";
    }
  }

  function updateQ1BannerNone() {
    const bannerMsg = document.getElementById("kw-q1-banner-msg");
    const actionBtn = document.getElementById("kw-q1-action-btn");

    if (bannerMsg) {
      bannerMsg.innerHTML = `No se encontró el quiz en Kahoot. Conserva la respuesta de la Pregunta 1 abajo e ingresa el UUID manualmente arriba.`;
      bannerMsg.style.color = colors.incorrect;
    }
    if (actionBtn) {
      actionBtn.style.display = "none";
    }
    quizIdInput.style.borderColor = colors.incorrect;
  }

  function updateQ1BannerWaitingTotalCount(candidateCount) {
    const bannerMsg = document.getElementById("kw-q1-banner-msg");
    if (bannerMsg) {
      bannerMsg.innerHTML = `Pregunta 1 resuelta. Se está buscando el quiz completo, por ahora quedan <b>${candidateCount} candidatos</b>`;
      bannerMsg.style.color = "rgba(255, 205, 85, 0.95)";
    }
  }

  function startWaitingForQ2() {
    isWaitingForQ2 = true;
    if (q2CheckInterval) clearInterval(q2CheckInterval);
    q2CheckInterval = setInterval(checkDOMForQ2, 250);
  }

  function checkDOMForQ2() {
    if (!isWaitingForQ2) return;
    try {
      const counterEl = document.querySelector('[data-functional-selector="question-index-counter"]');
      if (counterEl) {
        const txt = (counterEl.textContent || counterEl.parentElement?.textContent || "").trim();
        const m = txt.match(/\b(\d+)\s*(?:de|\/|of)\s*(\d+)\b/i);
        if (m) {
          const cur = parseInt(m[1], 10);
          const total = parseInt(m[2], 10);
          if (total && !knownTotalQuestions) {
            handleTotalGameBlockCount(total);
          }
          if (cur >= 2) {
            console.log(
              `%c[KW Live]%c DOM detectó avance a Pregunta ${cur}. Desplegando respuestas completas...`,
              "color:#22c55e;font-weight:bold",
              "color:inherit"
            );
            transitionToFullQuiz();
            return;
          }
        }
      }

      // Detectar pantalla de Scoreboard / Podio entre preguntas
      const scoreboardEl = document.querySelector(
        '[data-functional-selector="scoreboard"], [data-functional-selector="streak-counter"], [data-functional-selector="podium"], [class*="scoreboard-wrapper"], [class*="Scoreboard"]'
      );
      if (scoreboardEl) {
        console.log(
          `%c[KW Live]%c DOM detectó pantalla de Scoreboard (fin de Pregunta 1). Desplegando respuestas completas...`,
          "color:#22c55e;font-weight:bold",
          "color:inherit"
        );
        transitionToFullQuiz();
        return;
      }
    } catch (_) { }
  }

  function transitionToFullQuiz() {
    if (!isWaitingForQ2) return;
    isWaitingForQ2 = false;
    if (q2CheckInterval) {
      clearInterval(q2CheckInterval);
      q2CheckInterval = null;
    }

    console.log(
      `%c[KW Live]%c Transición a Pregunta 2 confirmada. Mostrando contenido completo.`,
      "color:#22c55e;font-weight:bold",
      "color:inherit"
    );

    // Si aún estábamos esperando totalGameBlockCount y no llegó antes de avanzar a la Pregunta 2:
    if (cachedCandidateSearchResults && cachedCandidateSearchResults.length > 0) {
      const list = cachedCandidateSearchResults;
      const block = cachedTargetBlock;
      const token = cachedSearchToken;
      const isAny = cachedIsAnyQuestion;
      cachedCandidateSearchResults = null;
      cachedTargetBlock = null;
      checkCandidates(list, block, knownTotalQuestions, token, isAny, false);
      return;
    }

    if (pendingResolvedQuiz) {
      const targetQuiz = pendingResolvedQuiz;
      pendingResolvedQuiz = null;
      pendingCandidateChoices = null;
      selectQuiz(targetQuiz);
    } else if (pendingCandidateChoices && pendingCandidateChoices.length > 0) {
      const choices = pendingCandidateChoices;
      pendingResolvedQuiz = null;
      pendingCandidateChoices = null;
      renderQuizCandidatesSelector(choices);
    } else {
      if (searchInProgress) {
        setStatus("Pregunta 1 finalizada. Esperando que concluya la búsqueda del quiz…", "rgba(120, 180, 255, 0.9)");
      }
    }
  }

  function onQuizStartDetected(data) {
    const targetBlock = extractTargetBlock(data);
    if (!targetBlock.question) return;

    firstQuestionBlock = data.firstGameBlockData || targetBlock;
    liveQuestionIndex = 0;
    if (
      firstQuestionBlock &&
      Array.isArray(firstQuestionBlock.choiceShapes) &&
      firstQuestionBlock.choiceShapes.length
    ) {
      liveQuestionType = "pin_it";
    } else if (firstQuestionBlock && firstQuestionBlock.type) {
      liveQuestionType = String(firstQuestionBlock.type).toLowerCase();
    }

    // Un QuizStart nuevo vuelve al comportamiento por defecto: si la opción
    // estaba apagada por los flags, se restaura; también se limpia cualquier
    // override manual de la partida anterior.
    if (autoDisabledByRandomFlags) {
      showAnswersEnabled = true;
    }
    autoDisabledByRandomFlags = false;
    manualOverrideRandomFlags = false;
    randomFlagsAllowAnswers = false;
    lastRandomFlagsAllowed = null;
    lastRandomFlagsReason = "";
    midGameDetected = false;
    midGameCandidateSince = 0;
    // Un QuizStart real confirma que no estamos en modo challenge.
    challengeModeDetected = false;
    challengeQuestionIndex = null;

    updateAnswerColoringState(data);
    scheduleAnswerPaint(25);

    console.log(
      `%c[KW Live]%c ¡QuizStart recibido! Mostrando Pregunta 1 inmediatamente en pantalla...`,
      "color:#22c55e;font-weight:bold",
      "color:inherit"
    );

    // 1. Mostrar Pregunta 1 de inmediato con respuesta correcta marcada
    renderFirstQuestionImmediate(data.firstGameBlockData || targetBlock);

    // 2. Iniciar el estado de espera para Pregunta 2 y monitoreo DOM
    startWaitingForQ2();

    // 3. Capturar total si ya viniera (e.g. en quizQuestionAnswers o DOM)
    let expectedCount = typeof data.totalGameBlockCount === "number"
      ? data.totalGameBlockCount
      : (Array.isArray(data.quizQuestionAnswers)
        ? data.quizQuestionAnswers.length
        : (knownTotalQuestions || detectTotalQuestionsFromDOM()));

    if (expectedCount) {
      knownTotalQuestions = expectedCount;
    }

    const myToken = ++fetchToken;
    quizIdInput.style.borderColor = colors.accent;
    startCandidateSearch(targetBlock, expectedCount, myToken, false, true);
  }

  async function startCandidateSearch(target, expectedCount, token, isAnyQuestion = false, deferToQ2 = false) {
    const targetBlock = extractTargetBlock(target);
    const query = (targetBlock.question || "").substring(0, 150);
    searchInProgress = true;
    pendingResolvedQuiz = null;
    pendingCandidateChoices = null;
    filteredCandidateSurvivors = null;
    setSelectAnotherCandidateVisible(false);
    cachedCandidateSearchResults = null;
    cachedTargetBlock = targetBlock;
    cachedSearchToken = token;
    cachedDeferToQ2 = deferToQ2;
    cachedIsAnyQuestion = isAnyQuestion;

    const randomLabel = targetBlock.randomQuestions
      ? "orden aleatorio: randomQuestions = true -> busca en cualquier pregunta"
      : "orden fijo: randomQuestions = false -> debe coincidir en Pregunta 1";

    console.group(
      `%c[KW Filtro]%c Iniciando búsqueda de quiz para: "%c${(targetBlock.question || "").substring(0, 55)}…%c" (%c${randomLabel}%c)`,
      "color:#a855f7;font-weight:bold",
      "color:inherit",
      "color:#38bdf8;font-style:italic",
      "color:inherit",
      "color:#facc15;font-weight:bold",
      "color:inherit"
    );

    const currentTotal = knownTotalQuestions || expectedCount || detectTotalQuestionsFromDOM();
    if (currentTotal) {
      knownTotalQuestions = currentTotal;
      console.log(`%c[KW Filtro]%c totalGameBlockCount disponible: ${currentTotal} preguntas.`, "color:#38bdf8;font-weight:bold", "color:inherit");
    } else {
      console.log(`%c[KW Filtro]%c En espera de totalGameBlockCount (Paquete 2) para ejecutar la comprobación de filtros en un solo paso...`, "color:#facc15;font-style:italic", "color:inherit");
    }

    const MAX_CANDIDATES = 1000;
    const PAGE_SIZE = 100;
    const allResults = [];
    const seenUuids = new Set();
    let cursor = 0;

    try {
      while (cursor < MAX_CANDIDATES) {
        if (token !== fetchToken) return;

        const url = `https://create.kahoot.it/rest/kahoots/?query=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&cursor=${cursor}&includeCard=false`;
        const r = await fetch(url);
        if (!r.ok) {
          if (cursor === 0) throw new Error("search_failed");
          break;
        }

        const body = await r.json();
        if (token !== fetchToken) return;

        const pageResults =
          body.entities || body.kahoots || (Array.isArray(body) ? body : []);

        if (!pageResults.length) {
          break;
        }

        for (const entry of pageResults) {
          const uuid = entry.card?.uuid || entry.uuid || entry.id;
          if (uuid) {
            if (seenUuids.has(uuid)) continue;
            seenUuids.add(uuid);
          }
          allResults.push(entry);
        }

        console.log(
          `%c[KW Filtro]%c Consulta API (cursor=${cursor}): +${pageResults.length} candidatos recibidos (total acumulado: ${allResults.length}).`,
          "color:#a855f7;font-weight:bold",
          "color:inherit"
        );

        if (pageResults.length < PAGE_SIZE || allResults.length >= MAX_CANDIDATES) {
          break;
        }

        cursor += PAGE_SIZE;
      }
    } catch (err) {
      if (token !== fetchToken) return;
      if (!allResults.length) {
        searchInProgress = false;
        console.error("%c[KW Filtro]%c Error al conectar con la API de búsqueda (CORS o red).", "color:#ef4444;font-weight:bold", "color:inherit");
        console.groupEnd();
        if (deferToQ2 && isWaitingForQ2) {
          updateQ1BannerNone();
        } else {
          setStatus(
            "No se pudo buscar el quiz (CORS bloqueado). Ingresa el UUID manualmente.",
            colors.incorrect
          );
          quizIdInput.style.borderColor = colors.incorrect;
        }
        return;
      }
    }

    if (token !== fetchToken) return;

    if (!allResults.length) {
      searchInProgress = false;
      console.warn("%c[KW Filtro]%c La API no devolvió ningún quiz coincidente con esa pregunta.", "color:#ef4444;font-weight:bold", "color:inherit");
      console.groupEnd();
      if (deferToQ2 && isWaitingForQ2) {
        updateQ1BannerNone();
      } else {
        setStatus("Quiz no encontrado. Ingresa el UUID manualmente.", colors.incorrect);
        quizIdInput.style.borderColor = colors.incorrect;
      }
      return;
    }

    // Atajo: con un solo resultado no hay comparación posible. Se acepta
    // de inmediato, sin esperar totalGameBlockCount ni ejecutar filtros.
    if (allResults.length === 1) {
      const onlyEntry = allResults[0];
      const onlyUuid = onlyEntry.card?.uuid || onlyEntry.uuid || onlyEntry.id;
      if (onlyUuid) {
        try {
          await acceptSingleCandidate(onlyEntry, onlyUuid, token, deferToQ2);
        } finally {
          console.groupEnd();
        }
        return;
      }
      console.warn(
        "%c[KW Filtro]%c El único resultado de la API no tiene UUID; se continúa con el flujo normal.",
        "color:#f59e0b;font-weight:bold",
        "color:inherit"
      );
    }

    cachedCandidateSearchResults = allResults.slice(0, MAX_CANDIDATES);
    console.log(
      `%c[KW Filtro]%c Obtenidos %c${cachedCandidateSearchResults.length}%c candidatos en la API.`,
      "color:#a855f7;font-weight:bold",
      "color:inherit",
      "color:#facc15;font-weight:bold",
      "color:inherit"
    );

    // Si ya se tiene totalGameBlockCount, ejecutamos la comprobación de una sola vez
    const totalNow = knownTotalQuestions || expectedCount || detectTotalQuestionsFromDOM();
    if (totalNow) {
      knownTotalQuestions = totalNow;
      const list = cachedCandidateSearchResults;
      cachedCandidateSearchResults = null;
      checkCandidates(list, targetBlock, totalNow, token, isAnyQuestion, deferToQ2);
    } else {
      // Si aún no llega el paquete 2, esperamos sin correr las comprobaciones todavía
      updateQ1BannerWaitingTotalCount(cachedCandidateSearchResults.length);
    }
  }

  // Cuando la API devuelve un único candidato no hay nada que comparar:
  // se carga su quiz y se acepta directamente, sin esperar
  // totalGameBlockCount ni ejecutar los cinco filtros.
  async function acceptSingleCandidate(entry, uuid, token, deferToQ2) {
    console.log(
      `%c[KW Filtro]%c Único candidato de la API (%c${uuid}%c). ` +
      `Se acepta sin esperar el total de preguntas ni ejecutar filtros.`,
      "color:#a855f7;font-weight:bold",
      "color:inherit",
      "color:#38bdf8;font-weight:bold",
      "color:inherit"
    );

    try {
      const r = await fetch(`https://kahoot.it/rest/kahoots/${encodeURIComponent(uuid)}`);
      if (token !== fetchToken) return;
      if (!r.ok) throw new Error("not_found");

      const quiz = await r.json();
      if (token !== fetchToken) return;
      if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) {
        throw new Error("empty_quiz");
      }

      quiz.uuid = uuid;
      if (entry.card) {
        quiz.cover = quiz.cover || entry.card.cover;
        quiz.title = quiz.title || entry.card.title;
        quiz.creator_username = quiz.creator_username || entry.card.creator_username;
      }

      // Si el paquete 2 ya había traído el total, se respeta; si no,
      // el propio quiz nos da una referencia para los siguientes pasos.
      if (!knownTotalQuestions) {
        knownTotalQuestions = quiz.questions.length;
      }

      searchInProgress = false;
      cachedCandidateSearchResults = null;
      cachedTargetBlock = null;

      if (deferToQ2 && isWaitingForQ2) {
        pendingResolvedQuiz = quiz;
        pendingCandidateChoices = null;
        // Las preguntas ya quedan disponibles para colorear la Pregunta 1,
        // aunque la lista completa se despliegue al llegar a la Pregunta 2.
        questions = parseQuestions(quiz.questions || []);
        scheduleAnswerPaint(25);
        updateQ1BannerResolved(quiz, { skippedFilters: true });
        console.log(
          `%c[KW Éxito]%c Candidato único aceptado: "%c${quiz.title || uuid}%c". ` +
          `Pulsa "Ver todas ya" o espera a la Pregunta 2 para ver el quiz completo.`,
          "color:#22c55e;font-weight:bold",
          "color:inherit",
          "color:#38bdf8;font-weight:bold",
          "color:inherit"
        );
      } else {
        selectQuiz(quiz);
        console.log(
          `%c[KW Éxito]%c Candidato único aceptado: "%c${quiz.title || uuid}%c". Respuestas listas.`,
          "color:#22c55e;font-weight:bold",
          "color:inherit",
          "color:#38bdf8;font-weight:bold",
          "color:inherit"
        );
      }
    } catch (_) {
      if (token !== fetchToken) return;
      searchInProgress = false;
      cachedCandidateSearchResults = null;
      cachedTargetBlock = null;
      console.error(
        `%c[KW Fallo]%c El único candidato de la API no se pudo cargar (${uuid}).`,
        "color:#ef4444;font-weight:bold",
        "color:inherit"
      );
      if (deferToQ2 && isWaitingForQ2) {
        updateQ1BannerNone();
      } else {
        quizIdInput.style.borderColor = colors.incorrect;
        setStatus("Quiz no encontrado o privado. Verifica el UUID.", colors.incorrect);
      }
    }
  }

  // Alias para mantener compatibilidad
  const searchAndMatchQuiz = startCandidateSearch;

  async function checkCandidates(candidates, targetBlock, expectedCount, token, isAnyQuestion = false, deferToQ2 = false) {
    searchInProgress = true;
    const filteredMatches = [];
    const totalExpected = expectedCount || knownTotalQuestions || detectTotalQuestionsFromDOM();

    const randomDesc = targetBlock.randomQuestions
      ? "orden aleatorio: randomQuestions = true -> busca en todas las preguntas"
      : "orden fijo: randomQuestions = false -> debe coincidir en Pregunta 1";

    console.log(
      `%c[KW Filtro]%c Candidatos encontrados en la API: %c${candidates.length}%c. Iniciando evaluación única en 5 pasos:`,
      "color:#a855f7;font-weight:bold",
      "color:inherit",
      "color:#facc15;font-weight:bold",
      "color:inherit"
    );
    console.log(
      `  • Paso 1: Coincidencia de texto (${randomDesc})\n` +
      `  • Paso 2: Opciones de respuesta (${targetBlock.choices?.length || 0} opciones + corrección)\n` +
      `  • Paso 3: ID de imagen (${targetBlock.imageMetadata?.id || (targetBlock.image ? "presente" : "sin imagen")})\n` +
      `  • Paso 4: Tiempo límite (${targetBlock.time ? targetBlock.time / 1000 + "s" : "no especificado"})\n` +
      `  • Paso 5: Total exacto de preguntas (${totalExpected ? totalExpected + " preguntas" : "desconocido"})`
    );

    const discardStats = { step1: 0, step2: 0, step3: 0, step4: 0, step5: 0 };
    const BATCH_SIZE = 25;

    for (let batchStart = 0; batchStart < candidates.length; batchStart += BATCH_SIZE) {
      // Cancelar si llegó una búsqueda más nueva entre lotes
      if (token !== fetchToken) {
        searchInProgress = false;
        return;
      }

      const batch = candidates.slice(batchStart, batchStart + BATCH_SIZE);
      const batchEnd = Math.min(batchStart + BATCH_SIZE, candidates.length);

      console.log(
        `%c[KW Filtro]%c Procesando lote ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(candidates.length / BATCH_SIZE)}: candidatos %c${batchStart + 1}–${batchEnd}%c de ${candidates.length}…`,
        "color:#a855f7;font-weight:bold",
        "color:inherit",
        "color:#facc15;font-weight:bold",
        "color:inherit"
      );

      // Lanzar todos los fetches del lote en paralelo
      const batchResults = await Promise.allSettled(
        batch.map(async (entry) => {
          const uuid = entry.card?.uuid || entry.uuid || entry.id;
          if (!uuid) return null;
          const r = await fetch(`https://kahoot.it/rest/kahoots/${uuid}`);
          if (!r.ok) return null;
          const quiz = await r.json();
          if (!quiz?.questions?.length) return null;
          return { quiz, entry, uuid };
        })
      );

      // Procesar resultados del lote
      batchResults.forEach((result, j) => {
        const globalIndex = batchStart + j + 1;
        if (result.status !== "fulfilled" || !result.value) return;

        const { quiz, entry, uuid } = result.value;
        const evalResult = evaluateCandidate(quiz, targetBlock, totalExpected, isAnyQuestion);
        const quizTitle = quiz.title || entry.card?.title || uuid;

        if (!evalResult.matched) {
          const stepKey = `step${evalResult.stepFailed}`;
          if (discardStats[stepKey] !== undefined) discardStats[stepKey]++;

          console.log(
            `%c[${globalIndex}/${candidates.length}] ❌ Descartado (Paso ${evalResult.stepFailed}):%c "${quizTitle}" %c-> ${evalResult.reason}`,
            "color:#ef4444;font-weight:bold",
            "color:inherit",
            "color:#f87171;font-style:italic"
          );
        } else {
          console.log(
            `%c[${globalIndex}/${candidates.length}] ✅ Superó todos los filtros:%c "${quizTitle}" (%c${quiz.questions.length} preguntas%c, UUID: ${uuid})`,
            "color:#22c55e;font-weight:bold",
            "color:inherit",
            "color:#38bdf8;font-weight:bold",
            "color:inherit"
          );

          quiz.uuid = uuid;
          if (entry.card) {
            quiz.cover = quiz.cover || entry.card.cover;
            quiz.title = quiz.title || entry.card.title;
            quiz.creator_username = quiz.creator_username || entry.card.creator_username;
          }
          filteredMatches.push(quiz);
        }
      });
    }

    if (token !== fetchToken) {
      searchInProgress = false;
      return;
    }

    searchInProgress = false;

    console.log(
      `%c[KW Resumen]%c Evaluados: %c${candidates.length}%c | Descartados: %c${candidates.length - filteredMatches.length}%c ` +
      `(P1 Texto: ${discardStats.step1}, P2 Opciones: ${discardStats.step2}, P3 Imagen: ${discardStats.step3}, P4 Tiempo: ${discardStats.step4}, P5 Total preguntas: ${discardStats.step5}) ` +
      `| Supervivientes: %c${filteredMatches.length}%c`,
      "color:#a855f7;font-weight:bold",
      "color:inherit",
      "color:#facc15;font-weight:bold",
      "color:inherit",
      "color:#ef4444;font-weight:bold",
      "color:inherit",
      "color:#22c55e;font-weight:bold;font-size:12px",
      "color:inherit"
    );

    // Conservar el grupo de supervivientes solo cuando hay más de uno. Se
    // guarda una copia para no compartir el array con el selector y poder
    // volver a él sin descartar ni modificar ningún candidato.
    filteredCandidateSurvivors = filteredMatches.length > 1 ? filteredMatches.slice() : null;
    setSelectAnotherCandidateVisible(false);

    // Gestionar según deferToQ2 y el estado de espera
    if (deferToQ2 && isWaitingForQ2) {
      if (filteredMatches.length === 1) {
        pendingResolvedQuiz = filteredMatches[0];
        pendingCandidateChoices = null;
        console.log(
          `%c[KW Éxito]%c Quiz único identificado: "%c${pendingResolvedQuiz.title}%c" (${pendingResolvedQuiz.uuid}). Esperando a Pregunta 2 para mostrar respuestas completas.`,
          "color:#22c55e;font-weight:bold",
          "color:inherit",
          "color:#38bdf8;font-weight:bold",
          "color:inherit"
        );
        console.groupEnd();
        updateQ1BannerResolved(pendingResolvedQuiz);
      } else if (filteredMatches.length > 1) {
        pendingCandidateChoices = filteredMatches;
        pendingResolvedQuiz = null;
        console.warn(
          `%c[KW Aviso]%c Quedan %c${filteredMatches.length}%c posibles quizzes candidatos. El selector aparecerá al iniciar la Pregunta 2.`,
          "color:#f59e0b;font-weight:bold",
          "color:inherit",
          "color:#facc15;font-weight:bold",
          "color:inherit"
        );
        console.groupEnd();
        updateQ1BannerCandidates(pendingCandidateChoices);
      } else if (filteredMatches.length === 0) {
        pendingResolvedQuiz = null;
        pendingCandidateChoices = null;
        console.error(
          `%c[KW Fallo]%c Ningún quiz sobrevivió a los filtros. Ingresa el UUID manualmente.`,
          "color:#ef4444;font-weight:bold",
          "color:inherit"
        );
        console.groupEnd();
        updateQ1BannerNone();
      }
    } else {
      // No estamos esperando a Q2 (o ya pasó a Q2)
      if (filteredMatches.length === 1) {
        console.log(
          `%c[KW Éxito]%c Quiz único identificado: "%c${filteredMatches[0].title}%c" (${filteredMatches[0].uuid}). Respuestas listas.`,
          "color:#22c55e;font-weight:bold",
          "color:inherit",
          "color:#38bdf8;font-weight:bold",
          "color:inherit"
        );
        console.groupEnd();
        selectQuiz(filteredMatches[0]);
      } else if (filteredMatches.length > 1) {
        console.warn(
          `%c[KW Aviso]%c Quedan %c${filteredMatches.length}%c posibles quizzes candidatos idénticos. Mostrando selector visual en el menú.`,
          "color:#f59e0b;font-weight:bold",
          "color:inherit",
          "color:#facc15;font-weight:bold",
          "color:inherit"
        );
        console.groupEnd();
        renderQuizCandidatesSelector(filteredMatches);
      } else {
        console.error(
          `%c[KW Fallo]%c Ningún quiz sobrevivió a los filtros. Ingresa el UUID manualmente.`,
          "color:#ef4444;font-weight:bold",
          "color:inherit"
        );
        console.groupEnd();
        setStatus("Quiz no encontrado. Ingresa el UUID manualmente.", colors.incorrect);
        quizIdInput.style.borderColor = colors.incorrect;
      }
    }
  }

  function selectQuiz(quiz) {
    setSelectAnotherCandidateVisible(false);
    fullQuizLoaded = true;
    isWaitingForQ2 = false;
    if (q2CheckInterval) {
      clearInterval(q2CheckInterval);
      q2CheckInterval = null;
    }
    const uuid = quiz.uuid || quiz.id;
    if (uuid) {
      quizIdInput.value = uuid;
    }
    quizIdInput.style.borderColor = colors.correct;
    setStatus("");
    questions = parseQuestions(quiz.questions || []);
    renderAllQuestions();
    scheduleAnswerPaint(25);
  }

  function setSelectAnotherCandidateVisible(visible) {
    const canShow =
      visible &&
      Array.isArray(filteredCandidateSurvivors) &&
      filteredCandidateSurvivors.length >= 2;
    selectAnotherCandidateSection.section.style.display = canShow ? "block" : "none";
  }

  function renderQuizCandidatesSelector(candidates) {
    setSelectAnotherCandidateVisible(false);
    clearAnswers();
    setStatus(
      "Se encontraron varios quizzes compatibles. Selecciona el que corresponde a tu partida:",
      "rgba(255, 205, 85, 0.95)"
    );
    quizIdInput.style.borderColor = colors.accent;

    // Barra de búsqueda
    const searchWrapper = document.createElement("div");
    Object.assign(searchWrapper.style, {
      position: "relative",
      width: "100%",
      marginBottom: "10px",
    });

    const searchIcon = document.createElement("span");
    searchIcon.textContent = "🔍";
    Object.assign(searchIcon.style, {
      position: "absolute",
      left: "10px",
      top: "46%",
      transform: "translateY(-50%)",
      fontSize: "14px",
      pointerEvents: "none",
      lineHeight: "1",
      marginTop: "-1px",
    });

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Filtrar por nombre del quiz…";
    searchInput.autocomplete = "off";
    Object.assign(searchInput.style, {
      width: "100%",
      boxSizing: "border-box",
      padding: "8px 12px 8px 34px",
      borderRadius: "8px",
      border: `1px solid ${colors.accent}`,
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      color: colors.text,
      fontSize: "13px",
      outline: "none",
      transition: "border-color 0.15s ease",
    });
    searchInput.addEventListener("focus", () => {
      searchInput.style.borderColor = colors.correct;
    });
    searchInput.addEventListener("blur", () => {
      searchInput.style.borderColor = colors.accent;
    });
    // Evitar que las teclas numéricas activen las respuestas de Kahoot mientras se escribe
    searchInput.addEventListener("keydown", (e) => { e.stopPropagation(); e.stopImmediatePropagation(); });
    searchInput.addEventListener("keyup", (e) => { e.stopPropagation(); e.stopImmediatePropagation(); });
    searchInput.addEventListener("keypress", (e) => { e.stopPropagation(); e.stopImmediatePropagation(); });

    searchWrapper.append(searchIcon, searchInput);

    // Mensaje de "sin resultados"
    const emptyMsg = document.createElement("div");
    emptyMsg.textContent = "Ningún quiz coincide con el filtro.";
    Object.assign(emptyMsg.style, {
      display: "none",
      color: "rgba(255,255,255,0.45)",
      fontSize: "13px",
      textAlign: "center",
      padding: "14px 0",
    });

    const listContainer = document.createElement("div");
    Object.assign(listContainer.style, {
      display: "flex",
      flexDirection: "column",
      gap: "14px",
      width: "100%",
    });

    candidates.forEach((quiz) => {
      const card = document.createElement("div");
      card.dataset.normalizedTitle = normalizeText(quiz.title);
      Object.assign(card.style, {
        borderRadius: "8px",
        overflow: "hidden",
        backgroundColor: colors.secondary,
        border: `1px solid ${colors.accent}`,
        cursor: "pointer",
        transition: "transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
        display: "flex",
        flexDirection: "column",
      });

      card.addEventListener("mouseenter", () => {
        card.style.transform = "scale(1.02)";
        card.style.borderColor = colors.correct;
        card.style.boxShadow = "0 6px 18px rgba(0, 0, 0, 0.5)";
      });
      card.addEventListener("mouseleave", () => {
        card.style.transform = "scale(1)";
        card.style.borderColor = colors.accent;
        card.style.boxShadow = "none";
      });

      // Imagen de portada
      const coverImg = document.createElement("img");
      const coverUrl =
        quiz.cover ||
        (quiz.coverMetadata?.id
          ? `https://media.kahoot.it/${quiz.coverMetadata.id}`
          : "https://assets-cdn.kahoot.it/builder/v2/assets/placeholder-cover.png");
      coverImg.src = coverUrl;
      coverImg.alt = quiz.title || "Portada del Quiz";
      Object.assign(coverImg.style, {
        width: "100%",
        height: "150px",
        objectFit: "cover",
        display: "block",
        backgroundColor: "rgba(0, 0, 0, 0.3)",
      });
      coverImg.onerror = () => {
        coverImg.style.display = "none";
      };

      // Barra inferior oscura con el nombre del quiz (idéntica a la imagen de referencia)
      const bottomBar = document.createElement("div");
      Object.assign(bottomBar.style, {
        backgroundColor: "rgba(25, 10, 5, 0.98)",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "3px",
        borderTop: "1px solid rgba(255, 255, 255, 0.08)",
      });

      const titleEl = document.createElement("div");
      titleEl.textContent = quiz.title || "Sin título";
      Object.assign(titleEl.style, {
        color: "#ffffff",
        fontSize: "15px",
        fontWeight: "700",
        lineHeight: "1.3",
        wordBreak: "break-word",
      });

      const metaEl = document.createElement("div");
      const qCount = quiz.questions?.length || quiz.number_of_questions || 0;
      const creator = quiz.creator_username ? ` • por ${quiz.creator_username}` : "";
      metaEl.textContent = `${qCount} preguntas${creator}`;
      Object.assign(metaEl.style, {
        color: "rgba(255, 255, 255, 0.6)",
        fontSize: "12px",
      });

      bottomBar.append(titleEl, metaEl);
      card.append(coverImg, bottomBar);

      card.addEventListener("click", () => {
        selectQuiz(quiz);
        setSelectAnotherCandidateVisible(true);
      });

      listContainer.appendChild(card);
    });

    // Filtrado instantáneo al escribir
    searchInput.oninput = () => {
      const query = normalizeText(searchInput.value);
      let visibleCount = 0;
      listContainer.childNodes.forEach((card) => {
        const matches = !query || card.dataset.normalizedTitle?.includes(query);
        card.style.display = matches ? "flex" : "none";
        if (matches) visibleCount++;
      });
      emptyMsg.style.display = visibleCount === 0 ? "block" : "none";
    };

    answersContainer.append(searchWrapper, listContainer, emptyMsg);
  }

  function triggerSearch() {
    const value = quizIdInput.value.trim();
    const myToken = ++fetchToken;
    resetQuizDetectionState();
    ensureBackgroundKeepAlive();

    clearTimeout(debounceTimer);

    if (value === "") {
      quizIdInput.style.borderColor = colors.accent;
      setStatus("");
      questions = [];
      clearAnswers();
      return;
    }

    debounceTimer = setTimeout(() => {
      if (UUID_RE.test(value)) {
        fetchByUUID(value, myToken);
      } else if (PIN_RE.test(value)) {
        // El interceptor WebSocket y el Keep-Alive detectarán el quiz
        // automáticamente aunque cambies de ventana a YouTube.
        ensureBackgroundKeepAlive();
        quizIdInput.style.borderColor = colors.accent;
        setStatus(
          "PIN válido. Las respuestas se mostrarán cuando aparezca la primera pregunta en la pantalla.",
          "rgba(120, 180, 255, 0.9)"
        );
      } else {
        quizIdInput.style.borderColor = colors.incorrect;
        setStatus("Formato inválido: ingresa un PIN numérico o un UUID válido.", colors.incorrect);
        questions = [];
        clearAnswers();
      }
    }, 800);
  }

  quizIdInput.addEventListener("input", triggerSearch);

  function parseQuestions(questionsJson) {
    return questionsJson.map((question) => {
      const q = {
        type: question.type,
        time: question.time,
        questionText: question.question || "",
      };
      if (["quiz", "multiple_select_quiz", "true_false"].includes(
        String(question.type || "").toLowerCase()
      )) {
        q.correctTexts = [];
        q.correctIndexes = [];
        q.incorrectIndexes = [];
        (question.choices || []).forEach((choice, choiceIndex) => {
          if (choice.correct) {
            q.correctTexts.push({
              text: choice.answer ?? null,
              imageId: choice.image?.id ?? null,
            });
            q.correctIndexes.push(choiceIndex);
          } else {
            q.incorrectIndexes.push(choiceIndex);
          }
        });
      }
      if (question.type === "open_ended") {
        q.answers = (question.choices || []).map((c) => c.answer);
      }
      if (question.type === "jumble" && Array.isArray(question.choices)) {
        q.answers = question.choices.map((c) => c.answer);
      }
      if (question.type === "pin_it") {
        q.image = question.image || "";
        q.imageWidth = (question.imageMetadata && question.imageMetadata.width) || 0;
        q.imageHeight =
          (question.imageMetadata && question.imageMetadata.height) || 0;
        q.choiceShapes = Array.isArray(question.choiceShapes)
          ? question.choiceShapes
          : [];
      }
      return q;
    });
  }

  // Observar la aparición/recarga de botones de respuesta para colorearlos.
  installAnswerColorObserver();

  // Capturar upToQuestion de las peticiones de progreso del modo challenge.
  installChallengeProgressWatcher();

  // Instalar interceptor de WebSocket (debe hacerse lo antes posible)
  installWebSocketInterceptor();

  // ─── Auto-detección y monitoreo silencioso de PIN ─────────────────────
  try {
    // 1. Detección si el PIN ya venía en los parámetros de la URL (?pin=...)
    const urlParams = new URLSearchParams(window.location.search);
    const pinFromUrl = urlParams.get("pin");
    if (pinFromUrl && PIN_RE.test(pinFromUrl) && quizIdInput.value.trim() === "") {
      quizIdInput.value = pinFromUrl;
      quizIdInput.style.borderColor = colors.accent;
      ensureBackgroundKeepAlive();
      setStatus(
        "PIN válido. Las respuestas se mostrarán cuando aparezca la primera pregunta en la pantalla.",
        "rgba(120, 180, 255, 0.9)"
      );
    }

    // 2. Monitoreo continuo del input de PIN de Kahoot
    const PIN_INPUT_SEL = 'input[data-functional-selector="game-pin-input"], #game-input';
    let lastRecordedPin = "";
    let pinInputTracked = null;

    const logPinUpdate = (val) => {
      val = (val || "").trim();
      if (val && val !== lastRecordedPin) {
        lastRecordedPin = val;
        console.log(
          `%c[KW PIN]%c Capturando PIN: ${lastRecordedPin}`,
          "color:#a855f7;font-weight:bold",
          "color:inherit"
        );
      }
    };

    // Delegación inmediata en capture-phase: detecta cualquier tecla aunque React
    // haya renderizado el input después de cargar el userscript
    document.addEventListener(
      "input",
      (e) => {
        if (e.target && e.target.matches && e.target.matches(PIN_INPUT_SEL)) {
          logPinUpdate(e.target.value);
        }
      },
      true
    );

    const pinWatchInterval = setInterval(() => {
      const currentInput = document.querySelector(PIN_INPUT_SEL);

      if (currentInput) {
        if (!pinInputTracked) {
          // El input acaba de aparecer en el DOM (montado por React)
          pinInputTracked = currentInput;
          const initVal = currentInput.value.trim();
          if (initVal) {
            console.log(
              `%c[KW PIN]%c PIN detectado en pantalla: ${initVal}`,
              "color:#a855f7;font-weight:bold",
              "color:inherit"
            );
            logPinUpdate(initVal);
          }
        } else {
          // Mantener actualizado por si se autocompleta o cambia sin evento input directo
          const currentVal = currentInput.value.trim();
          if (currentVal) {
            logPinUpdate(currentVal);
          }
        }
      } else if (pinInputTracked) {
        // El campo estaba en pantalla y acaba de desaparecer (usuario presionó Enter / se unió)
        pinInputTracked = null;

        // Validar con PIN_RE
        if (lastRecordedPin && PIN_RE.test(lastRecordedPin)) {
          console.log(
            `%c[KW PIN]%c PIN capturado final: ${lastRecordedPin}`,
            "color:#10b981;font-weight:bold",
            "color:inherit"
          );
          // Verificar si el campo del menú está vacío
          if (quizIdInput.value.trim() === "") {
            quizIdInput.value = lastRecordedPin;
            quizIdInput.style.borderColor = colors.accent;
            ensureBackgroundKeepAlive();
            setStatus(
              "PIN válido. Las respuestas se mostrarán cuando aparezca la primera pregunta en la pantalla.",
              "rgba(120, 180, 255, 0.9)"
            );
          }
        }
      }
    }, 100);

    window.__kwPinWatchInterval = pinWatchInterval;
  } catch (_) { }

  // Iniciar protección Keep-Alive de fondo
  ensureBackgroundKeepAlive();

  console.log("%c[Kahoot Winner]%c Listo. Interceptores y Keep-Alive en segundo plano activos.", "color: #a855f7; font-weight: bold;", "color: inherit;");
})();
