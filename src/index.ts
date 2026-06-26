import "@logseq/libs";
import { D2 } from "@terrastruct/d2";

let d2Instance: D2 | null = null;
let d2RecreatePromise: Promise<D2> | null = null;
let renderQueue: Promise<void> = Promise.resolve();

// IDs must match d2themescatalog (d2themes/d2themescatalog/catalog.go).
const themeMap: Record<string, number> = {
  "Default": 0,
  "Neutral Grey": 1,
  "Flagship Terrastruct": 3,
  "Cool Classics": 4,
  "Mixed Berry Blue": 5,
  "Grape Soda": 6,
  "Aubergine": 7,
  "Colorblind Clear": 8,
  "Vanilla Nitro Cola": 100,
  "Orange Creamsicle": 101,
  "Shirley Temple": 102,
  "Earth Tones": 103,
  "Everglade Green": 104,
  "Buttered Toast": 105,
  "Terminal": 300,
  "Terminal Grayscale": 301,
  "Origami": 302,
  "C4": 303,
  "Dark Mauve": 200,
  "Dark Flagship Terrastruct": 201,
};

const settingsSchema: Array<{
  key: string;
  type: string;
  title: string;
  description: string;
  default: string;
  enumChoices?: string[];
}> = [
    {
      key: "layoutEngine",
      type: "enum",
      title: "Layout Engine",
      description: "D2 layout engine. Dagre and ELK are available.",
      default: "dagre",
      enumChoices: ["dagre", "elk"],
    },
    {
      key: "sketch",
      type: "boolean",
      title: "Sketch Mode",
      description: "Enable hand-drawn sketch style for diagrams.",
      default: "false",
    },
    {
      key: "theme",
      type: "enum",
      title: "Theme",
      description: "Theme for rendered diagrams.",
      default: "Default",
      enumChoices: Object.keys(themeMap),
    },
  ];

function getLayout(): "dagre" | "elk" {
  const layout = (logseq.settings?.layoutEngine as string) || "dagre";
  return layout === "elk" ? "elk" : "dagre";
}

function getSketch(): boolean {
  const s = logseq.settings?.sketch;
  return s === true || s === "true";
}

function getThemeID(): number {
  const name = (logseq.settings?.theme as string) || "Default";
  return themeMap[name] ?? 0;
}

function getD2(): D2 {
  if (!d2Instance) {
    d2Instance = new D2();
  }
  return d2Instance;
}

// Serialized recreation: if multiple blocks fail concurrently,
// only one new D2 instance is created and all waiters share it.
function recreateD2(): Promise<D2> {
  if (!d2RecreatePromise) {
    d2RecreatePromise = new Promise((resolve) => {
      d2Instance = new D2();
      // Give the WASM worker a moment to initialize.
      setTimeout(() => {
        d2RecreatePromise = null;
        resolve(d2Instance!);
      }, 100);
    });
  }
  return d2RecreatePromise;
}

function renderD2(source: string): Promise<string> {
  // Serialize all renders — the WASM worker can't handle concurrent calls.
  const job = renderQueue.then(async () => {
    const renderOpts = {
      sketch: getSketch(),
      themeID: getThemeID(),
      pad: 20,
      scale: 1,
      noXMLTag: true,
    };

    const attempt = async (d2: D2): Promise<string> => {
      const result = await d2.compile(source, {
        layout: getLayout(),
        sketch: renderOpts.sketch,
        themeID: renderOpts.themeID,
        pad: renderOpts.pad,
        scale: renderOpts.scale,
        noXMLTag: renderOpts.noXMLTag,
      });
      const svg = await d2.render(result.diagram, result.renderOptions);
      if (typeof svg === "string") return svg;
      throw new Error("render returned non-string");
    };

    try {
      return await attempt(getD2());
    } catch {
      const d2 = await recreateD2();
      return await attempt(d2);
    }
  });

  // Keep queue moving even if this job fails.
  renderQueue = job.then(() => { }, () => { });
  return job;
}


async function main() {
  // Kill stale WASM worker from previous plugin load.
  d2Instance = null;

  logseq.useSettingsSchema(settingsSchema as any);

  const React = logseq.Experiments.React as any;

  logseq.Experiments.registerFencedCodeRenderer("d2", {
    render: (props) => {
      // Logseq may pass content in different shapes depending on
      // edit mode, plugin reload, etc. Extract defensively.
      let content = "";
      if (typeof props === "string") {
        content = props;
      } else if (props && typeof props === "object") {
        const p = props as any;
        if (typeof p.content === "string") {
          content = p.content;
        } else if (typeof p.content === "object" && p.content !== null) {
          // content may be wrapped: { content: { content: "..." } }
          content = typeof p.content.content === "string"
            ? p.content.content
            : JSON.stringify(p.content);
        } else {
          // Last resort: log for debugging
          console.warn("[logseq-d2] unexpected props shape:", JSON.stringify(props));
        }
      }
      const elRef = React.useRef<HTMLDivElement>(null);

      React.useEffect(() => {
        const el = elRef.current;
        if (!el) return;
        if (!content.trim()) {
          el.textContent = "Empty D2 diagram";
          return;
        }
        let cancelled = false;

        el.textContent = "Rendering D2 diagram...";

        renderD2(content)
          .then((svg) => {
            if (cancelled || !el) return;
            el.innerHTML = svg;
          })
          .catch((err: any) => {
            if (cancelled || !el) return;
            el.textContent = `D2 Error: ${err?.message || String(err)}`;
            el.style.color = "#c0392b";
            el.style.fontFamily = "monospace";
          });

        return () => { cancelled = true; };
      }, [content]);

      return React.createElement("div", {
        ref: elRef,
        className: "d2",
      });
    },
  });


  console.log("logseq-d2 plugin loaded");
}

logseq.ready(main).catch(console.error);
