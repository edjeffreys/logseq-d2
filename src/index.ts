import "@logseq/libs";
import { D2 } from "@terrastruct/d2";

let d2Instance: D2 | null = null;

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
    key: "themeID",
    type: "enum",
    title: "Theme",
    description:
      "Theme for rendered diagrams. 0 = default, 1 = Neutral Grey, 3 = Flagship Terrastruct, 4 = Cool Classics, 5 = Mixed Berry Blue, 6 = Grape Soda, 7 = Aubergine, 8 = Color Blind Clear, 100 = Terminal, 101 = Terminal Grayscale, 102 = Origami, 103 = Dark Mauve, 200 = Dark Mauve (Dark), 201 = Terminal (Dark), 300 = Dark Flagship Terrastruct",
    default: "0",
    enumChoices: [
      "0", "1", "3", "4", "5", "6", "7", "8",
      "100", "101", "102", "103",
      "200", "201", "300",
    ],
  },
];

async function initD2(): Promise<void> {
  d2Instance = new D2();
  console.log("logseq-d2: D2 WASM initialized");
}

function getLayout(): "dagre" | "elk" {
  const layout = (logseq.settings?.layoutEngine as string) || "dagre";
  return layout === "elk" ? "elk" : "dagre";
}

function getSketch(): boolean {
  const s = logseq.settings?.sketch;
  return s === true || s === "true";
}

function getThemeID(): number {
  const num = parseInt(String(logseq.settings?.themeID ?? "0"), 10);
  return isNaN(num) ? 0 : num;
}

async function renderD2(source: string): Promise<string> {
  if (!d2Instance) throw new Error("D2 WASM not initialized");

  const result = await d2Instance.compile(source, {
    layout: getLayout(),
  });

  return await d2Instance.render(result.diagram, {
    ...result.renderOptions,
    sketch: getSketch(),
    themeID: getThemeID(),
    pad: 20,
    scale: 1,
    noXMLTag: true,
  });
}

async function main() {
  logseq.useSettingsSchema(settingsSchema as any);
  await initD2();

  const React = logseq.Experiments.React as any;

  logseq.Experiments.registerFencedCodeRenderer("d2", {
    edit: true,
    render: ({ content }) => {
      const elRef = React.useRef<HTMLDivElement>(null);

      React.useEffect(() => {
        const el = elRef.current;
        if (!el) return;
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
