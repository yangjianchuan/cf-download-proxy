import { buildProxyUrl, canOpenProxyUrl, normalizeSource, summarizeUrl } from "./url-tools.js";

const proxyStorageKey = "cf-download-proxy:last-link";

const copyText = async (value) => {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        throw new Error("clipboard-write-unavailable");
    }
    await navigator.clipboard.writeText(value);
};

const fitTextarea = (element, maxHeight) => {
    if (!element) {
        return;
    }

    element.style.height = "0px";
    const nextHeight = Math.max(element.scrollHeight, 0);
    const finalHeight = typeof maxHeight === "number" ? Math.min(nextHeight, maxHeight) : nextHeight;
    element.style.height = `${finalHeight}px`;
};

const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
    return element;
};

const host = window.location.host;
const originPrefix = `${window.location.origin}/`;
const searchParams = new URLSearchParams(window.location.search);
const presetValue = searchParams.get("url");
const storageKey = proxyStorageKey;

const sourceInput = document.getElementById("source-input");
const resultOutput = document.getElementById("result-output");
const feedbackText = document.getElementById("feedback-text");
const sourceSummary = document.getElementById("source-summary");
const openButton = document.getElementById("open-button");
const copyButton = document.getElementById("copy-button");
const clearButton = document.getElementById("clear-button");
const usageTabs = Array.from(document.querySelectorAll("[data-usage-tab]"));
const usagePanels = Array.from(document.querySelectorAll("[data-usage-panel]"));

setText("host-value", host);

const flashButton = (button, label) => {
    const original = button.dataset.label || button.textContent;
    button.dataset.label = original;
    button.textContent = label;
    window.clearTimeout(button._resetTimer);
    button._resetTimer = window.setTimeout(() => {
        button.textContent = original;
    }, 1500);
};

const wsProxyPrefix = window.location.protocol === "https:"
    ? `wss://${window.location.host}/`
    : `ws://${window.location.host}/`;

const getUsageInputValue = (panel) => {
    const input = panel.querySelector("[data-usage-input]");
    if (!input) {
        return "";
    }
    return input.value.trim() || input.defaultValue || "";
};

const buildUsageCommand = (panel) => {
    const template = panel.dataset.commandTemplate || "";
    return template
        .replaceAll("{{proxy}}", originPrefix)
        .replaceAll("{{wsProxy}}", wsProxyPrefix)
        .replaceAll("{{value}}", getUsageInputValue(panel));
};

const syncUsagePanel = (panel) => {
    const codeBlock = panel.querySelector("[data-usage-code]");
    if (codeBlock) {
        codeBlock.textContent = buildUsageCommand(panel);
    }
};

const activateUsage = (key) => {
    usageTabs.forEach((tab) => {
        const isActive = tab.dataset.usageTab === key;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    usagePanels.forEach((panel) => {
        const isActive = panel.dataset.usagePanel === key;
        panel.classList.toggle("is-active", isActive);
        panel.classList.toggle("is-hidden", !isActive);
    });
};

usagePanels.forEach((panel) => {
    syncUsagePanel(panel);
});

document.getElementById("usage-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-usage-tab]");
    if (tab) {
        activateUsage(tab.dataset.usageTab);
    }
});

document.querySelector(".usage-panels").addEventListener("input", (event) => {
    const input = event.target.closest("[data-usage-input]");
    if (!input) {
        return;
    }

    const panel = input.closest("[data-usage-panel]");
    if (!panel) {
        return;
    }

    syncUsagePanel(panel);
});

document.querySelector(".usage-panels").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-usage]");
    if (!button) {
        return;
    }

    const panel = button.closest("[data-usage-panel]");
    if (!panel) {
        return;
    }

    try {
        await copyText(buildUsageCommand(panel));
        flashButton(button, "已复制");
    } catch (error) {
        setFeedback("复制示例失败，请手动选择命令。", "error");
    }
});

const setFeedback = (text, type) => {
    feedbackText.textContent = text;
    feedbackText.className = `status${type ? ` is-${type}` : ""}`;
};

const setActionState = (enabled, href = "", allowOpen = enabled) => {
    openButton.disabled = !allowOpen;
    copyButton.disabled = !enabled;
    openButton.dataset.href = href;
};

const storeLastInput = (value) => {
    try {
        if (value) {
            window.localStorage.setItem(storageKey, value);
        } else {
            window.localStorage.removeItem(storageKey);
        }
    } catch (error) {
        // Storage can be blocked by browser privacy settings; the page still works without it.
    }
};

const restoreLastInput = () => {
    try {
        return window.localStorage.getItem(storageKey) || "";
    } catch (error) {
        return "";
    }
};

const render = (rawValue) => {
    fitTextarea(sourceInput, 220);
    const parsed = normalizeSource(rawValue, {
        origin: window.location.origin,
        host: window.location.host
    });

    if (parsed.empty) {
        resultOutput.value = originPrefix;
        fitTextarea(resultOutput, 180);
        setFeedback(parsed.message);
        sourceSummary.textContent = "等待新的链接";
        setActionState(false);
        storeLastInput("");
        return;
    }

    if (!parsed.ok) {
        resultOutput.value = originPrefix;
        fitTextarea(resultOutput, 180);
        setFeedback(parsed.message, "error");
        sourceSummary.textContent = "请检查链接";
        setActionState(false);
        storeLastInput(rawValue.trim());
        return;
    }

    const proxyUrl = buildProxyUrl(parsed.url, window.location);
    const summary = summarizeUrl(parsed.url);
    const canOpen = canOpenProxyUrl(parsed.url);
    resultOutput.value = proxyUrl;
    fitTextarea(resultOutput, 220);
    setFeedback(parsed.message, "success");
    sourceSummary.textContent = `${summary.protocol.toUpperCase()} · ${summary.host}${summary.path}`;
    setActionState(true, proxyUrl, canOpen);
    storeLastInput(parsed.input);
};

sourceInput.addEventListener("input", () => {
    render(sourceInput.value);
});

sourceInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !openButton.disabled) {
        window.open(openButton.dataset.href, "_blank", "noopener");
    }
});

clearButton.addEventListener("click", () => {
    sourceInput.value = "";
    render("");
    sourceInput.focus();
});

openButton.addEventListener("click", () => {
    if (!openButton.dataset.href) {
        return;
    }
    window.open(openButton.dataset.href, "_blank", "noopener");
});

copyButton.addEventListener("click", async () => {
    if (!resultOutput.value) {
        return;
    }
    try {
        await copyText(resultOutput.value);
        flashButton(copyButton, "已复制");
    } catch (error) {
        setFeedback("复制失败，请手动选择结果地址。", "error");
    }
});

resultOutput.addEventListener("focus", () => {
    resultOutput.select();
});

const initialValue = presetValue || restoreLastInput();
sourceInput.value = initialValue;
render(initialValue);
sourceInput.focus();
sourceInput.setSelectionRange(sourceInput.value.length, sourceInput.value.length);
