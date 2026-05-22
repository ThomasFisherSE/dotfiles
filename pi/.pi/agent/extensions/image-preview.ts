import { CustomEditor, getSettingsListTheme, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Container, Image, SettingsList, Text, type SettingItem } from "@earendil-works/pi-tui";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type AnyImage = {
	type?: string;
	data?: string;
	mimeType?: string;
	source?: { type?: string; data?: string; mediaType?: string };
};

type PreviewImage = {
	data: string;
	mimeType: string;
	label?: string;
	path?: string;
};

type BrokerResponse<T = unknown> = { ok: true; result: T } | { ok: false; error: string };
type PolicyResult = { path: string; policy: { decision: "allow" | "ask" | "deny"; reason: string } };
type ReadImageResult = { path: string; data: string; mimeType: string; bytes: number; policy: unknown };
type PopupResult = { started: boolean; paneId?: string; scriptPath?: string };

const CUSTOM_TYPE = "image-preview";
const socketPath = process.env.PI_HOST_BROKER_SOCKET || "/run/pi-host-broker.sock";
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

function imageWidthCells(): number {
	const value = Number(process.env.PI_IMAGE_PREVIEW_WIDTH_CELLS ?? "60");
	return Number.isFinite(value) && value > 0 ? value : 60;
}

function imageHeightCells(): number {
	const value = Number(process.env.PI_IMAGE_PREVIEW_HEIGHT_CELLS ?? "24");
	return Number.isFinite(value) && value > 0 ? value : 24;
}

function normalizeImage(block: AnyImage, label?: string): PreviewImage | null {
	if (!block || block.type !== "image") return null;

	if (typeof block.data === "string") {
		return {
			data: stripDataUrl(block.data),
			mimeType: block.mimeType ?? mimeTypeFromDataUrl(block.data) ?? "image/png",
			label,
		};
	}

	if (block.source?.type === "base64" && typeof block.source.data === "string") {
		return {
			data: stripDataUrl(block.source.data),
			mimeType: block.source.mediaType ?? mimeTypeFromDataUrl(block.source.data) ?? "image/png",
			label,
		};
	}

	return null;
}

function stripDataUrl(data: string): string {
	const comma = data.indexOf(",");
	return data.startsWith("data:") && comma >= 0 ? data.slice(comma + 1) : data;
}

function mimeTypeFromDataUrl(data: string): string | undefined {
	const match = /^data:([^;,]+)[;,]/.exec(data);
	return match?.[1];
}

function mimeTypeFromPath(filePath: string): string | null {
	const ext = path.extname(filePath).toLowerCase();
	if (ext === ".png") return "image/png";
	if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
	if (ext === ".gif") return "image/gif";
	if (ext === ".webp") return "image/webp";
	return null;
}

function byteLength(base64: string): number {
	try {
		return Buffer.byteLength(base64, "base64");
	} catch {
		return 0;
	}
}

function expandPath(input: string): string {
	if (input === "~") return os.homedir();
	if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
	return input;
}

function parsePastedImagePaths(text: string): string[] {
	const candidates = text
		.split(/[\r\n\t]+/)
		.flatMap((line) => line.split(/ +/))
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => part.replace(/^['"]|['"]$/g, ""))
		.map((part) => {
			if (part.startsWith("file://")) {
				try {
					return fileURLToPath(part);
				} catch {
					return part;
				}
			}
			return part;
		});

	const paths = candidates.filter((candidate) => {
		const ext = path.extname(candidate).toLowerCase();
		return imageExtensions.has(ext) && (path.isAbsolute(candidate) || candidate.startsWith("~/"));
	});

	return [...new Set(paths)];
}

function imageReference(_pathText: string, index: number): string {
	return `[Image ${index + 1}]`;
}

function replacePastedImagePaths(text: string, paths: string[], startIndex = 0): string {
	let transformed = text;
	for (const [index, pastedPath] of paths.entries()) {
		const variants = [pastedPath];
		if (path.isAbsolute(pastedPath)) variants.push(`file://${pastedPath}`);

		for (const variant of variants) {
			transformed = transformed.split(variant).join(imageReference(pastedPath, startIndex + index));
		}
	}
	return transformed.trim() || paths.map((p, i) => imageReference(p, startIndex + i)).join("\n");
}

function extractImageLabels(text: string): string[] {
	const oldStyle = [...text.matchAll(/\[Image (\d+)\]/g)].map((match) => `Image ${match[1]}`);
	const markdownStyle = [...text.matchAll(/\[[^\]]+\]\(Image (\d+)\)/g)].map((match) => `Image ${match[1]}`);
	return [...new Set([...oldStyle, ...markdownStyle])];
}

function isBackspace(data: string): boolean {
	return data === "\x7f" || data === "\b" || data === "\x08";
}

function removeTrailingImageReference(text: string): string | null {
	// CustomEditor does not expose cursor position, so this intentionally only
	// makes the common case atomic: cursor at end, backspacing the image ref.
	const complete = /\s*(?:\[[^\]]+\]\(Image \d+\)|\[Image \d+\])$/.exec(text);
	if (complete) return text.slice(0, complete.index).replace(/[ \t]+$/g, "");
	return null;
}

class ImagePathEditor extends CustomEditor {
	private seenKeys = new Set<string>();

	constructor(
		tui: any,
		theme: any,
		keybindings: any,
		private readonly onImagePaths: (paths: string[]) => void,
		private readonly onRemoveLastImage: () => void,
	) {
		super(tui, theme, keybindings);
	}

	handleInput(data: string): void {
		if (isBackspace(data)) {
			const withoutImage = removeTrailingImageReference(this.getText());
			if (withoutImage !== null) {
				this.setText(withoutImage);
				this.onRemoveLastImage();
				return;
			}
		}

		super.handleInput(data);

		// File-manager image copies often paste a file path/URI as text. Collapse
		// those immediately in the editor to a stable image reference and let the
		// extension open the real preview pane asynchronously. Do not render images
		// inside the editor itself; that was brittle and could crash Pi/tmux.
		const text = this.getText();
		const paths = parsePastedImagePaths(text);
		if (paths.length === 0) return;

		const newPaths = paths.filter((p) => !this.seenKeys.has(p));
		const startIndex = this.seenKeys.size;
		for (const p of newPaths) this.seenKeys.add(p);
		this.setText(replacePastedImagePaths(text, paths, startIndex));
		if (newPaths.length > 0) this.onImagePaths(newPaths);
	}
}

function localPathForHostPath(hostPath: string): string | null {
	const expanded = expandPath(hostPath);
	if (fs.existsSync(expanded)) return expanded;

	// Common pi-sandbox case: a host path under the launched project is visible as /workspace.
	const cwd = process.cwd();
	if (cwd === "/workspace") {
		const base = path.basename(expanded);
		const workspaceCandidate = path.join("/workspace", base);
		if (fs.existsSync(workspaceCandidate)) return workspaceCandidate;
	}

	return null;
}

function brokerRequest<T>(request: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection(socketPath);
		let data = "";
		let settled = false;

		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			fn();
		};

		const onAbort = () => finish(() => reject(new Error("Host broker request aborted")));
		signal?.addEventListener("abort", onAbort, { once: true });

		socket.setEncoding("utf8");
		socket.setTimeout(5 * 60 * 1000, () => finish(() => reject(new Error("Host broker request timed out"))));
		socket.on("connect", () => socket.write(JSON.stringify(request) + "\n"));
		socket.on("data", (chunk) => {
			data += chunk;
		});
		socket.on("end", () => {
			signal?.removeEventListener("abort", onAbort);
			finish(() => {
				let response: BrokerResponse<T>;
				try {
					response = JSON.parse(data) as BrokerResponse<T>;
				} catch (error) {
					reject(new Error(`Invalid host broker response: ${String(error)}`));
					return;
				}
				if (!response.ok) reject(new Error(response.error));
				else resolve(response.result);
			});
		});
		socket.on("error", (error) => {
			signal?.removeEventListener("abort", onAbort);
			finish(() => reject(new Error(`Host broker unavailable at ${socketPath}: ${error.message}`)));
		});
	});
}

async function showImagePopup(image: PreviewImage, signal?: AbortSignal): Promise<PopupResult> {
	return showImagesPopup([image], signal);
}

async function showImagesPopup(images: PreviewImage[], signal?: AbortSignal): Promise<PopupResult> {
	return brokerRequest<PopupResult>({
		action: "preview_image_popup",
		images: images.map((image) => ({
			data: image.data,
			mimeType: image.mimeType,
			label: image.label ?? image.path ?? "Pi image preview",
			path: image.path,
		})),
		label: images.length === 1 ? (images[0]?.label ?? images[0]?.path ?? "Pi image preview") : `Pi image preview (${images.length} images)`,
		cols: imageWidthCells(),
		rows: imageHeightCells(),
		wait: false,
	}, signal);
}

async function readImagePath(hostPath: string, ctx: any, signal?: AbortSignal): Promise<PreviewImage | null> {
	const localPath = localPathForHostPath(hostPath);
	if (localPath) {
		const mimeType = mimeTypeFromPath(localPath);
		if (!mimeType) return null;
		const data = fs.readFileSync(localPath).toString("base64");
		return { data, mimeType, path: hostPath };
	}

	const classification = await brokerRequest<PolicyResult>({ action: "classify", op: "read_file", path: hostPath }, signal);
	if (classification.policy.decision === "deny") {
		ctx.ui.notify(`Image paste denied by policy: ${classification.policy.reason}`, "error");
		return null;
	}

	let approved = classification.policy.decision === "allow";
	if (!approved) {
		const choice = await ctx.ui.select(
			`Preview pasted image?\n\nPath: ${classification.path}\nReason: ${classification.policy.reason}`,
			["Allow once", "Deny"],
		);
		approved = choice === "Allow once";
	}
	if (!approved) return null;

	const result = await brokerRequest<ReadImageResult>({ action: "read_image", path: hostPath, approved }, signal);
	return { data: result.data, mimeType: result.mimeType, path: result.path };
}

function imageTheme(theme: any) {
	return {
		...theme,
		fallbackColor: (s: string) => theme.fg?.("dim", s) ?? s,
	};
}

const ansiPreviewCache = new Map<string, string[]>();

function extensionForMimeType(mimeType: string): string {
	if (mimeType === "image/jpeg") return ".jpg";
	if (mimeType === "image/gif") return ".gif";
	if (mimeType === "image/webp") return ".webp";
	return ".png";
}

function kittyEscape(data: string, cols: number, rows: number): string {
	const esc = "\x1b";
	const st = "\x1b\\";
	let output = "";
	const chunkSize = 4096;
	for (let offset = 0; offset < data.length; offset += chunkSize) {
		const chunk = data.slice(offset, offset + chunkSize);
		const more = offset + chunkSize < data.length ? 1 : 0;
		const prefix = offset === 0
			// c/r tell Ghostty/tmux how many terminal cells the placement occupies.
			// Without this, the image can render, but Pi's text layout doesn't reserve
			// the right area and it may appear near/under the prompt.
			? `${esc}_Ga=T,f=100,q=2,c=${cols},r=${rows},m=${more};`
			: `${esc}_Gm=${more};`;
		output += `${prefix}${chunk}${st}`;
	}
	return output;
}

function tmuxPassthrough(sequence: string): string {
	if (!process.env.TMUX) return sequence;
	// tmux passthrough: wrap ESC sequences inside DCS "tmux;" and double ESC.
	return `\x1bPtmux;${sequence.replaceAll("\x1b", "\x1b\x1b")}\x1b\\`;
}

function clearKittyImages(): string {
	return tmuxPassthrough("\x1b_Ga=d,d=A\x1b\\");
}

class KittyImagePreview {
	constructor(private readonly image: PreviewImage) {}

	render(width: number): string[] {
		if (this.image.mimeType !== "image/png") {
			return ["[Native Kitty preview only supports PNG in this extension]"];
		}
		const cols = Math.max(20, Math.min(width, imageWidthCells()));
		const rows = Math.max(1, Math.min(imageHeightCells(), 24));
		// Use space-filled rows, not empty strings. Some render paths trim/collapse
		// empty lines, which leaves the terminal image floating over later UI.
		return [tmuxPassthrough(kittyEscape(this.image.data, cols, rows)) + " ", ...Array(rows - 1).fill(" ")];
	}

	invalidate(): void {}
}

class AnsiImagePreview {
	constructor(
		private readonly image: PreviewImage,
		private readonly maxHeight: number,
	) {}

	render(width: number): string[] {
		const renderWidth = Math.max(20, Math.min(width, imageWidthCells()));
		const hash = crypto.createHash("sha256").update(this.image.data).digest("hex");
		const key = `${this.image.mimeType}:${renderWidth}:${this.maxHeight}:${hash}`;
		const cached = ansiPreviewCache.get(key);
		if (cached) return cached;

		const tmpPath = path.join(os.tmpdir(), `pi-image-preview-${hash}${extensionForMimeType(this.image.mimeType)}`);
		try {
			fs.writeFileSync(tmpPath, Buffer.from(this.image.data, "base64"));
			const result = spawnSync("img2txt", ["-W", String(renderWidth), "-H", String(this.maxHeight), "-f", "utf8", tmpPath], {
				encoding: "utf8",
				maxBuffer: 1024 * 1024,
			});
			if (result.status !== 0 || !result.stdout.trim()) {
				const lines = ["[ANSI image preview unavailable: img2txt failed]"];
				ansiPreviewCache.set(key, lines);
				return lines;
			}
			const lines = result.stdout.split(/\r?\n/).filter(Boolean);
			ansiPreviewCache.set(key, lines);
			return lines;
		} catch (error) {
			return [`[ANSI image preview unavailable: ${error instanceof Error ? error.message : String(error)}]`];
		}
	}

	invalidate(): void {}
}

function renderImages(images: PreviewImage[], title: string, theme: any) {
	const box = new Box(1, 1, (s: string) => theme.bg("customMessageBg", s));
	const container = new Container();

	container.addChild(new Text(theme.fg("accent", theme.bold(title)), 0, 0));

	for (const [index, image] of images.entries()) {
		const label = image.label ?? `image ${index + 1}`;
		const size = byteLength(image.data);
		const sizeText = size > 0 ? `, ${(size / 1024).toFixed(1)} KiB` : "";
		const pathText = image.path ? ` — ${image.path}` : "";
		container.addChild(new Text(theme.fg("dim", `${label}: ${image.mimeType}${sizeText}${pathText}`), 0, 0));
		if (process.env.PI_IMAGE_PREVIEW_RAW_KITTY === "1") {
			container.addChild(new Text(theme.fg("dim", "Raw Kitty/Ghostty preview:"), 0, 0));
			container.addChild(new KittyImagePreview(image));
		} else {
			container.addChild(
				new Image(image.data, image.mimeType, imageTheme(theme), {
					maxWidthCells: imageWidthCells(),
					maxHeightCells: imageHeightCells(),
				}),
			);
		}
		if (process.env.PI_IMAGE_PREVIEW_ANSI_FALLBACK === "1") {
			container.addChild(new Text(theme.fg("dim", "ANSI fallback preview:"), 0, 0));
			container.addChild(new AnsiImagePreview(image, imageHeightCells()));
		}
	}

	box.addChild(container);
	return box;
}

export default function (pi: ExtensionAPI) {
	let enabled = process.env.PI_IMAGE_PREVIEW !== "0";
	let popupEnabled = process.env.PI_IMAGE_PREVIEW_POPUP !== "0";
	let lastImages: PreviewImage[] = [];
	let activePreviewPanes: string[] = [];
	let currentPromptPreviewImages: PreviewImage[] = [];
	const pendingEditorPaths = new Map<string, string>();

	async function closePreviewPanes() {
		const panes = activePreviewPanes;
		activePreviewPanes = [];
		currentPromptPreviewImages = [];
		for (const paneId of panes) {
			try {
				await brokerRequest({ action: "close_preview_pane", paneId }, undefined);
			} catch {
				// Already closed or broker unavailable; ignore.
			}
		}
	}

	async function replacePreviewPane(images: PreviewImage[], signal?: AbortSignal) {
		const oldPanes = activePreviewPanes;
		activePreviewPanes = [];
		for (const paneId of oldPanes) {
			try { await brokerRequest({ action: "close_preview_pane", paneId }, undefined); } catch {}
		}
		if (images.length === 0) return;
		const result = await showImagesPopup(images, signal);
		if (result.paneId) activePreviewPanes = [result.paneId];
	}

	function removeLastEditorImage() {
		const lastKey = [...pendingEditorPaths.keys()].at(-1);
		if (lastKey) pendingEditorPaths.delete(lastKey);
		currentPromptPreviewImages = currentPromptPreviewImages.slice(0, -1);
		lastImages = lastImages.slice(0, -1);
		void replacePreviewPane(currentPromptPreviewImages, undefined);
	}

	function rememberEditorPaths(paths: string[]) {
		pendingEditorPaths.clear();
		for (const [index, pastedPath] of paths.entries()) {
			pendingEditorPaths.set(`Image ${index + 1}`, pastedPath);
		}
	}

	function rememberAdditionalEditorPaths(paths: string[]) {
		const start = pendingEditorPaths.size;
		for (const [index, pastedPath] of paths.entries()) {
			const imageNumber = start + index + 1;
			pendingEditorPaths.set(`Image ${imageNumber}`, pastedPath);
		}
	}

	pi.registerMessageRenderer(CUSTOM_TYPE, (message, _options, theme) => {
		const details = message.details as { title?: string; images?: PreviewImage[] } | undefined;
		const images = details?.images ?? [];
		if (images.length === 0) {
			return new Text(theme.fg("warning", "No image preview data"), 0, 0);
		}
		return renderImages(images, details?.title ?? "Image preview", theme);
	});

	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setEditorComponent((tui, theme, keybindings) => new ImagePathEditor(tui, theme, keybindings, (paths) => {
			rememberAdditionalEditorPaths(paths);
			if (!popupEnabled) return;
			for (const [index, pastedPath] of paths.entries()) {
				void readImagePath(pastedPath, ctx, ctx.signal)
					.then(async (image) => {
						if (!image) return;
						const imageNumber = pendingEditorPaths.size - paths.length + index + 1;
						const preview = { ...image, label: `Image ${imageNumber}`, path: pastedPath };
						lastImages = [...lastImages, preview];
						currentPromptPreviewImages = [...currentPromptPreviewImages, preview];
						await replacePreviewPane(currentPromptPreviewImages, ctx.signal);
					})
					.catch((error) => ctx.ui.notify(`Could not open image preview pane: ${error instanceof Error ? error.message : String(error)}`, "error"));
			}
		}, removeLastEditorImage));
	});

	pi.registerCommand("image-preview", {
		description: "Configure image previews. Use /image-preview enable|disable|toggle|show [n]|clear.",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (arg === "") {
				const items: SettingItem[] = [
					{ id: "previewPane", label: "Preview pane on pasted images", currentValue: popupEnabled ? "enabled" : "disabled", values: ["enabled", "disabled"] },
					{ id: "attachment", label: "Attach image to submitted prompt", currentValue: enabled ? "enabled" : "disabled", values: ["enabled", "disabled"] },
				];
				await ctx.ui.custom((tui, theme, _kb, done) => {
					const container = new Container();
					container.addChild(new Text(theme.fg("accent", theme.bold("Image Preview Settings")), 1, 1));
					container.addChild(new Text(theme.fg("dim", "Enter/Space toggles • Esc closes"), 1, 0));
					const settings = new SettingsList(
						items,
						Math.min(items.length + 2, 8),
						getSettingsListTheme(),
						(id, value) => {
							if (id === "previewPane") popupEnabled = value === "enabled";
							if (id === "attachment") enabled = value === "enabled";
						},
						() => done(undefined),
						{ enableSearch: false },
					);
					container.addChild(settings);
					return {
						render: (width: number) => container.render(width),
						invalidate: () => container.invalidate(),
						handleInput: (data: string) => { settings.handleInput?.(data); tui.requestRender(); },
					};
				});
				ctx.ui.notify(`Image preview pane ${popupEnabled ? "enabled" : "disabled"}; attachments ${enabled ? "enabled" : "disabled"}`, "info");
				return;
			}
			if (arg === "clear") {
				process.stdout.write(clearKittyImages());
				ctx.ui.notify("Cleared Kitty/Ghostty terminal images.", "info");
				return;
			}
			if (arg === "enable" || arg === "popup") {
				popupEnabled = true;
				ctx.ui.notify("Image preview pane enabled.", "info");
				return;
			}
			if (arg === "disable" || arg === "popup-off") {
				popupEnabled = false;
				ctx.ui.notify("Image preview pane disabled.", "info");
				return;
			}
			if (arg === "toggle") {
				popupEnabled = !popupEnabled;
				ctx.ui.notify(`Image preview pane ${popupEnabled ? "enabled" : "disabled"}.`, "info");
				return;
			}
			if (arg.startsWith("show")) {
				const index = Math.max(0, Number(arg.split(/\s+/)[1] ?? "1") - 1);
				const image = lastImages[index];
				if (!image) {
					ctx.ui.notify("No image available to show.", "warning");
					return;
				}
				try {
					await showImagePopup(image, ctx.signal);
				} catch (error) {
					ctx.ui.notify(`Could not open image preview pane: ${error instanceof Error ? error.message : String(error)}`, "error");
				}
				return;
			}
			if (arg === "attach-on") enabled = true;
			else if (arg === "attach-off") enabled = false;
			else ctx.ui.notify("Usage: /image-preview enable|disable|toggle|show [n]|clear", "warning");
		},
	});

	pi.on("input", async (event, ctx) => {
		void closePreviewPanes();
		if (!enabled) return { action: "continue" };

		const attachedImages = (event.images ?? [])
			.map((image: AnyImage, i: number) => normalizeImage(image, `pasted image ${i + 1}`))
			.filter((image: PreviewImage | null): image is PreviewImage => image !== null);

		const pathImages: PreviewImage[] = [];
		let pastedPaths: string[] = [];
		let usedEditorReferences = false;
		if (attachedImages.length === 0 && event.text) {
			const editorLabelPaths = extractImageLabels(event.text)
				.map((label) => pendingEditorPaths.get(label))
				.filter((p): p is string => Boolean(p));
			usedEditorReferences = editorLabelPaths.length > 0;
			pastedPaths = (usedEditorReferences ? editorLabelPaths : parsePastedImagePaths(event.text)).slice(0, 8);
			for (const [index, pastedPath] of pastedPaths.entries()) {
				try {
					const image = await readImagePath(pastedPath, ctx, ctx.signal);
					if (image) pathImages.push({ ...image, label: `pasted image ${index + 1}` });
				} catch (error) {
					ctx.ui.notify(`Could not read pasted image ${pastedPath}: ${error instanceof Error ? error.message : String(error)}`, "error");
				}
			}
		}

		const images = [...attachedImages, ...pathImages];
		if (images.length > 0) {
			lastImages = images;
			pi.sendMessage({
				customType: CUSTOM_TYPE,
				content: `Pasted ${images.length} image${images.length === 1 ? "" : "s"}`,
				display: true,
				details: { title: "Pasted image preview", images },
			});
			if (popupEnabled && pathImages.length === 0) {
				currentPromptPreviewImages = images;
				void replacePreviewPane(images, ctx.signal).catch((error) => {
					ctx.ui.notify(`Could not open image preview pane: ${error instanceof Error ? error.message : String(error)}`, "error");
				});
			}
		}

		if (pathImages.length > 0) {
			return {
				action: "transform" as const,
				text: usedEditorReferences ? event.text : replacePastedImagePaths(event.text, pastedPaths),
				images: pathImages.map((image) => ({ type: "image", data: image.data, mimeType: image.mimeType })),
			};
		}

		return { action: "continue" };
	});

	pi.on("tool_result", async (event) => {
		if (!enabled) return;

		const images = (event.content ?? [])
			.map((content: AnyImage, i: number) => normalizeImage(content, `${event.toolName} image ${i + 1}`))
			.filter((image: PreviewImage | null): image is PreviewImage => image !== null);

		if (images.length > 0) {
			pi.sendMessage({
				customType: CUSTOM_TYPE,
				content: `${event.toolName} returned ${images.length} image${images.length === 1 ? "" : "s"}`,
				display: true,
				details: { title: `Image from ${event.toolName}`, images },
			});
		}
	});
}
