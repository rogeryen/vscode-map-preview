'use strict';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import fileUrl = require('file-url');

enum SourceType {
    SCRIPT,
    STYLE
}

const EPSG_REGEX = /^EPSG:\d+$/g;
const SCHEME = "map-preview";
const WEBVIEW_TYPE = "mapPreview";
const PREVIEW_COMMAND_ID = "mvf.map.preview";
const PREVIEW_PROJ_COMMAND_ID = "mvf.map.preview-with-proj";

interface IWebViewContext {
    asWebviewUri(src: vscode.Uri): vscode.Uri;
    getCspSource(): string;
    getScriptNonce(): string;
    getStylesheetNonce(): string;
}

function makePreviewUri(doc: vscode.TextDocument): vscode.Uri {
    return vscode.Uri.parse(`${SCHEME}://map-preview/map-preview: ${doc.fileName}`);
}

class PreviewDocumentContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private _projections = new Map<string, string>();
    private _subscriptions: vscode.Disposable;

    constructor(private extensionPath: string) {
        this._subscriptions = vscode.Disposable.from(
            vscode.workspace.onDidOpenTextDocument(this.onDocumentOpened.bind(this))
        );
    }

    dispose() {
        this._projections.clear();
        this._subscriptions.dispose();
        this._onDidChange.dispose();
    }

    onDocumentOpened(e: vscode.TextDocument): void {
        //console.log(`Document opened ${e.uri}`);
        const uri = makePreviewUri(e);
        this._onDidChange.fire(uri);
    }

    public triggerVirtualDocumentChange(uri: vscode.Uri): void {
        this._onDidChange.fire(uri);
    }

    public clearPreviewProjection(uri: vscode.Uri): void {
        this._projections.delete(uri.toString());
    }

    public setPreviewProjection(uri: vscode.Uri, projection: string): void {
        this._projections.set(uri.toString(), projection);
    }

    private resolveDocument(uri: vscode.Uri): vscode.TextDocument {
        const matches = vscode.window.visibleTextEditors.filter(ed => {
            return makePreviewUri(ed.document).toString() == uri.toString();
        });
        if (matches.length >= 1) { //If we get more than one match, it's probably because the same document has been opened more than once (eg. split view)
            return matches[0].document;
        } else {
            return null;
        }
    }

    private async parseFeatureChildrenIntoMvf(children, featureName, folder, mvf) {
        for (const child of children) {
            const levelId = child.name.split(".")[0];
            if (!mvf[levelId]) {
                mvf[levelId] = {};
            }
            const mvfUri = vscode.Uri.file(`${folder}/${featureName}/${child.name}`);
            const levelDoc = await vscode.workspace.openTextDocument(mvfUri);
            mvf[levelId][featureName] = JSON.parse(this.cleanText(levelDoc.getText()));
        }
    }

    private async generateDocumentContent(uri: vscode.Uri): Promise<string> {
        const doc = this.resolveDocument(uri);
        if (doc) {
            let proj = null;
            const sUri = uri.toString();
            if (this._projections.has(sUri)) {
                proj = this._projections.get(sUri);
            }

            const mvf = {};
            try {
                const manifest = JSON.parse(this.cleanText(doc.getText()));
                const folderStruct = manifest.features[0].properties["folder_struct"];
                const folder = doc.fileName.substring(0, doc.fileName.lastIndexOf("/"));
                // parse levels first
                for (const feat of folderStruct) {
                    if (feat.name === "level") {
                        await this.parseFeatureChildrenIntoMvf(feat.children, "level", folder, mvf);
                        break;
                    }
                }
                // parse the rest of the features
                for (const feat of folderStruct) {
                    switch (feat.name) {
                        case "building.geojson":
                            const mvfUri = vscode.Uri.file(`${folder}/building.geojson`);
                            const buildingDoc = await vscode.workspace.openTextDocument(mvfUri);
                            const building = JSON.parse(this.cleanText(buildingDoc.getText()));
                            for (const levelId in mvf) {
                                mvf[levelId]["building"] = building;
                            }
                            break;
                        case "space":
                            await this.parseFeatureChildrenIntoMvf(feat.children, "space", folder, mvf);
                            break;
                        case "node":
                            await this.parseFeatureChildrenIntoMvf(feat.children, "node", folder, mvf);
                            break;
                        case "obstruction":
                            await this.parseFeatureChildrenIntoMvf(feat.children, "obstruction", folder, mvf);
                            break;
                        case "connection":
                            await this.parseFeatureChildrenIntoMvf(feat.children, "connection", folder, mvf);
                            break;
                    }
                }
            } catch (e) {
                throw new Error(`Unable to parse manifest: ${e.message}`)
            }

            const content = this.createMapPreview(doc, mvf, proj);
            const debugSettings = vscode.workspace.getConfiguration("mvf.map.preview.debug");
            if (debugSettings.has("dumpContentPath")) {
                const dumpPath = debugSettings.get<string>("dumpContentPath");
                if (dumpPath) {
                    try {
                        fs.writeFileSync(dumpPath, content);
                    } catch (e) {
                        vscode.window.showErrorMessage(`Error dumping preview content: ${e.message}`);
                    }
                }
            }
            return content;
        } else {
            return this.errorSnippet(`<h1>Error preparing preview</h1><p>Cannot resolve document for virtual document URI: ${uri.toString()}</p>`);
        }
    }

    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const content = await this.generateDocumentContent(uri);
        return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <!--
        Use a content security policy to only allow loading images from https or from our extension directory,
        and only allow scripts that have a specific nonce.
        -->
        <meta 
            http-equiv="Content-Security-Policy"
            content="default-src 'none';
                img-src ${this._wctx.getCspSource()} data: https:;
                style-src 'unsafe-inline' ${this._wctx.getCspSource()};
                style-src-elem 'unsafe-inline' ${this._wctx.getCspSource()};
                script-src 'nonce-${this._wctx.getScriptNonce()}' ${this._wctx.getCspSource()};" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MVF Map Preview</title>
    </head>
    ${content}
</html>`;
    }

    private errorSnippet(error: string): string {
        return `
            <body>
                ${error}
            </body>`;
    }

    /**
     * Expose an event to signal changes of _virtual_ documents
     * to the editor
     */
    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    private _wctx: IWebViewContext | undefined;

    public attachWebViewContext(xformer: IWebViewContext) {
        this._wctx = xformer;
    }

    public detachWebViewContext() {
        this._wctx = undefined;
    }

    private createLocalSource(file: string, type: SourceType) {
        const onDiskPath = vscode.Uri.file(
            path.join(this.extensionPath, 'static', file)
        );
        const source_path = this._wctx.asWebviewUri(onDiskPath);
        switch (type) {
            case SourceType.SCRIPT:
                return `<script nonce="${this._wctx.getScriptNonce()}" src="${source_path}" type="text/javascript"></script>`;
            case SourceType.STYLE:
                return `<link nonce="${this._wctx.getStylesheetNonce()}" href="${source_path}" rel="stylesheet" />`;
        }
    }

    private cleanText(text: string): string {
        const scrubRegexes = [
            { regex: /\\/g, replace: "\\\\" },                      //Existing backslashes
            { regex: /(<\!\[CDATA\[[\s\S]*?]]>)/g, replace: "" },   //CDATA blocks in XML
            { regex: /`/g, replace: "\\`" },                        //Backticks
            { regex: /\${/g, replace: "\\${" }                      //Start of ES6 template string placeholder
        ];
        for (const r of scrubRegexes) {
            text = text.replace(r.regex, r.replace);
        }
        return text;
    }

    private createMapPreview(doc: vscode.TextDocument, mvf, projection: string = null) {
        //Should we languageId check here?
        let text = JSON.stringify(JSON.stringify(mvf));
        text = text.substring(1, text.length - 1);
        const config = vscode.workspace.getConfiguration("mvf.map.preview");
        return `<body>
            <div id="map" style="width: 100%; height: 100%">
                <div id="format" style="position: absolute; left: 40; top: 5; z-index: 100; padding: 5px; background: yellow; color: black"></div>
            </div>` +
            this.createLocalSource("ol.css", SourceType.STYLE) +
            this.createLocalSource("ol-layerswitcher.css", SourceType.STYLE) +
            this.createLocalSource("ol-popup.css", SourceType.STYLE) +
            this.createLocalSource("proj4.js", SourceType.SCRIPT) +
            this.createLocalSource("papaparse.min.js", SourceType.SCRIPT) +
            this.createLocalSource("ol.js", SourceType.SCRIPT) +
            this.createLocalSource("ol-layerswitcher.js", SourceType.SCRIPT) +
            this.createLocalSource("ol-popup.js", SourceType.SCRIPT) +
            this.createLocalSource("preview.js", SourceType.SCRIPT) +
            this.createLocalSource("preview.css", SourceType.STYLE) +
            `<script nonce="${this._wctx.getScriptNonce()}" type="text/javascript">

                function setError(e) {
                    var mapEl = document.getElementById("map");
                    var errHtml = "<h1>An error occurred rendering preview</h1>";
                    //errHtml += "<p>" + e.name + ": " + e.message + "</p>";
                    errHtml += "<pre>" + e.stack + "</pre>";
                    mapEl.innerHTML = errHtml;
                }

                try {
                    var previewProj = ${projection ? ('"' + projection + '"') : "null"};
                    var previewConfig = ${JSON.stringify(config)};
                    previewConfig.sourceProjection = previewProj;
                    var content = ${JSON.stringify(mvf)};
                    var formatOptions = { featureProjection: 'EPSG:3857' };
                    if (previewProj != null) {
                        formatOptions.dataProjection = previewProj; 
                    }
                    createPreviewSource(content, formatOptions, previewConfig, function (preview) {
                        document.getElementById("format").innerHTML = "Format: " + preview.driver;
                        initPreviewMap('map', preview, previewConfig);
                    });
                } catch (e) {
                    setError(e);
                }
            </script>
        </body>`;
    }
}

async function loadWebView(content: PreviewDocumentContentProvider, previewUri: vscode.Uri, fileName: string, extensionPath: string) {
    //const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
    const panel = vscode.window.createWebviewPanel(
        WEBVIEW_TYPE,
        `MVF Map Preview: ${fileName}`,
        vscode.ViewColumn.Two,
        {
            // Enable scripts in the webview
            enableScripts: true,
            // Restrict the webview to only loading content from our extension's `static` directory.
            localResourceRoots: [
                vscode.Uri.file(path.join(extensionPath, 'static'))
            ]
        }
    );
    const scriptNonce = getNonce();
    const cssNonce = getNonce();
    const wctx: IWebViewContext = {
        asWebviewUri: uri => panel.webview.asWebviewUri(uri),
        getCspSource: () => panel.webview.cspSource,
        getScriptNonce: () => scriptNonce,
        getStylesheetNonce: () => cssNonce
    };
    content.attachWebViewContext(wctx);
    const html = await content.provideTextDocumentContent(previewUri);
    content.detachWebViewContext();
    panel.webview.html = html;
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

interface ProjectionItem extends vscode.QuickPickItem {
    projection: string;
}

// function parseManifest

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const extensionPath = context.extensionPath;
    const provider = new PreviewDocumentContentProvider(extensionPath);
    const registration = vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider);
    const previewCommand = vscode.commands.registerCommand(PREVIEW_COMMAND_ID, () => {
        const doc = vscode.window.activeTextEditor.document;
        const docName = path.basename(doc.fileName);
        // if (docName !== 'manifest.geojson') {
        //     throw Error('not MVF manifest');
        // }
        const previewUri = makePreviewUri(doc);
        provider.clearPreviewProjection(previewUri);
        provider.triggerVirtualDocumentChange(previewUri);
        loadWebView(provider, previewUri, docName, extensionPath);
    });

    // const previewWithProjCommand = vscode.commands.registerCommand(PREVIEW_PROJ_COMMAND_ID, () => {
    //     const opts: vscode.QuickPickOptions = {
    //         canPickMany: false,
    //         //prompt: "Enter the EPSG code for your projection",
    //         placeHolder: "EPSG:XXXX"
    //     };
    //     const config = vscode.workspace.getConfiguration("mvf.map.preview");
    //     const codes = [
    //         "EPSG:4326",
    //         "EPSG:3857",
    //         ...config.projections
    //             .filter(prj => prj.epsgCode != 4326 && prj.epsgCode != 3857)
    //             .map(prj => `EPSG:${prj.epsgCode}`)
    //     ].map((epsg: string) => ({
    //         label: `Preview in projection (${epsg})`,
    //         projection: epsg
    //     } as ProjectionItem));
    //     vscode.window.showQuickPick(codes, opts).then(val => {
    //         if (val) {
    //             const doc = vscode.window.activeTextEditor.document;
    //             const docName = path.basename(doc.fileName);
    //             const previewUri = makePreviewUri(doc);
    //             provider.setPreviewProjection(previewUri, val.projection);
    //             provider.triggerVirtualDocumentChange(previewUri);
    //             loadWebView(provider, previewUri, docName, extensionPath);
    //         }
    //     });
    // });

    context.subscriptions.push(previewCommand, registration);
}

// this method is called when your extension is deactivated
export function deactivate() {

}