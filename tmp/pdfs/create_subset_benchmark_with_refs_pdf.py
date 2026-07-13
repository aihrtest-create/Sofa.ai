from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageOps
import argparse
import json
import os
import textwrap


ROOT = "/Users/dima/Documents/Sofa.ai"
PAGE_W, PAGE_H = landscape(A4)
M = 30
OXBLOOD = colors.HexColor("#651f1d")
INK = colors.HexColor("#221f1d")
MUTED = colors.HexColor("#716963")
PAPER = colors.HexColor("#fbf7ef")
LINE = colors.HexColor("#d8cec3")
PALE = colors.HexColor("#efe5da")


LABELS = {
    "a1": "A1 - OpenAI gpt-image-2",
    "b1": "B1 - Gemini 3.1 Flash Image / Vertex",
    "c1": "C1 - Gemini 3 Pro Image / Vertex",
    "d1": "D1 - Imagen product-image edit",
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--sofas", default="")
    parser.add_argument("--variants", default="")
    return parser.parse_args()


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def run_manifest(run_dir):
    return load_json(os.path.join(run_dir, "manifest.json"))


def sofa_ids(batch, requested):
    if requested:
        return [item.strip() for item in requested.split(",") if item.strip()]
    return [item["id"] for item in batch.get("sofas", [])]


def variant_ids(batch, requested):
    if requested:
        return [item.strip() for item in requested.split(",") if item.strip()]
    return [item["id"] for item in batch.get("variants", []) if item["id"] in LABELS]


def manifest_for(run_dir, variant, sofa):
    return load_json(os.path.join(run_dir, "runs", variant, f"sofa-{sofa}", "manifest.json"))


def refs_for(run_dir, variant, sofa):
    refs_dir = os.path.join(run_dir, "runs", variant, f"sofa-{sofa}", "refs")
    if not os.path.isdir(refs_dir):
        return []
    names = sorted(
        name for name in os.listdir(refs_dir)
        if os.path.splitext(name.lower())[1] in [".jpg", ".jpeg", ".png", ".webp"]
    )
    return [os.path.join(refs_dir, name) for name in names]


def output_path(run_dir, variant, sofa, manifest):
    outputs = manifest.get("outputs") or []
    if not outputs:
        return None
    return os.path.join(run_dir, "runs", variant, f"sofa-{sofa}", outputs[0]["path"])


def prepare_image(path):
    cache = os.path.join(ROOT, "tmp", "pdfs", "benchmark_refs_cache")
    os.makedirs(cache, exist_ok=True)
    safe = path.replace(ROOT, "").strip("/").replace("/", "__")
    target = os.path.join(cache, f"{safe}.jpg")
    if os.path.exists(target):
        return target
    img = Image.open(path)
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((2200, 2200), Image.Resampling.LANCZOS)
    img.save(target, "JPEG", quality=88, optimize=True)
    return target


def fit_image(c, path, x, y, w, h, border=True):
    img_path = prepare_image(path)
    img = Image.open(img_path)
    iw, ih = img.size
    scale = min(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    dx, dy = x + (w - dw) / 2, y + (h - dh) / 2
    if border:
        c.setStrokeColor(LINE)
        c.setLineWidth(0.7)
        c.rect(x, y, w, h, stroke=1, fill=0)
    c.drawImage(ImageReader(img), dx, dy, dw, dh, preserveAspectRatio=True, mask="auto")


def draw_wrapped(c, text, x, y, width, size=9, leading=12, color=MUTED):
    c.setFont("Helvetica", size)
    c.setFillColor(color)
    chars = max(12, int(width / (size * 0.5)))
    for line in textwrap.wrap(str(text), chars):
        c.drawString(x, y, line)
        y -= leading
    return y


def header(c, title, subtitle=None):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(OXBLOOD)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(M, PAGE_H - 34, title)
    if subtitle:
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(M, PAGE_H - 50, subtitle[:140])
    c.setStrokeColor(LINE)
    c.line(M, PAGE_H - 60, PAGE_W - M, PAGE_H - 60)


def footer(c, page_no):
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawRightString(PAGE_W - M, 18, f"Page {page_no}")


def title_page(c, page_no, batch, variants):
    header(
        c,
        "Sofa.ai 6-Shot Preview Benchmark",
        f"{batch.get('id')} · scene {batch.get('sceneId')} · shot set {batch.get('shotSet', {}).get('id')}",
    )
    y = PAGE_H - 95
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(M, y, "Scope")
    y -= 20
    y = draw_wrapped(
        c,
        "This report compares full contact-sheet previews only. It includes the original sofa references, generated Sofa Passport files, and A1/B1/C1 model outputs. No final image generation is included.",
        M,
        y,
        PAGE_W - 2 * M,
        9,
        13,
        INK,
    )
    y -= 10
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(INK)
    c.drawString(M, y, "Cost and latency")
    y -= 24
    col_x = [M, M + 190, M + 310, M + 440, M + 590]
    for x, h in zip(col_x, ["Variant", "Sheets", "Total cost", "Avg cost", "Avg latency"]):
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(OXBLOOD)
        c.drawString(x, y, h)
    y -= 12
    c.setStrokeColor(LINE)
    c.line(M, y + 6, PAGE_W - M, y + 6)
    for variant in variants:
        runs = [r for r in batch.get("runs", []) if r.get("variant") == variant and r.get("status") == "ok"]
        total = sum(float((r.get("cost") or {}).get("usd") or 0) for r in runs)
        latency = sum(int(r.get("latencyMs") or 0) for r in runs)
        count = len(runs)
        exact = all((r.get("cost") or {}).get("exact") is not False for r in runs)
        suffix = "" if exact else " est."
        c.setFillColor(INK)
        c.setFont("Helvetica", 9)
        c.drawString(col_x[0], y, LABELS.get(variant, variant.upper()))
        c.drawRightString(col_x[1] + 40, y, str(count))
        c.drawRightString(col_x[2] + 70, y, f"${total:.4f}{suffix}")
        c.drawRightString(col_x[3] + 70, y, f"${(total / max(1, count)):.4f}{suffix}")
        c.drawRightString(col_x[4] + 70, y, f"{round(latency / max(1, count))} ms")
        y -= 18
    y -= 12
    y = draw_wrapped(
        c,
        f"Passport provider: {batch.get('passportProvider')}. Passport prompt version: section geometry, asymmetric module width rules, no-equalization rules, and leg acceptance criteria.",
        M,
        y,
        PAGE_W - 2 * M,
        9,
        13,
        INK,
    )
    footer(c, page_no)


def sofa_overview(c, run_dir, sofa, variants, page_no):
    refs = refs_for(run_dir, variants[0], sofa)
    header(c, f"Sofa {sofa} - references and generated previews", "Full contact sheets: Hero, Front, Depth, Detail, Elevated, Room.")
    ref_y = PAGE_H - 92
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(M, ref_y, "Original references")
    max_refs = min(len(refs), 6)
    ref_gap = 8
    ref_w = (PAGE_W - 2 * M - (max_refs - 1) * ref_gap) / max(1, max_refs)
    for idx, ref in enumerate(refs[:max_refs]):
        fit_image(c, ref, M + idx * (ref_w + ref_gap), ref_y - 80, ref_w, 68)

    top = ref_y - 105
    col_gap = 12
    col_w = (PAGE_W - 2 * M - (len(variants) - 1) * col_gap) / len(variants)
    img_h = 245
    for idx, variant in enumerate(variants):
        x = M + idx * (col_w + col_gap)
        m = manifest_for(run_dir, variant, sofa)
        p = output_path(run_dir, variant, sofa, m)
        c.setFillColor(OXBLOOD)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x, top, variant.upper())
        c.setFillColor(INK)
        c.setFont("Helvetica", 8)
        c.drawString(x + 28, top, LABELS.get(variant, "").replace(f"{variant.upper()} - ", ""))
        cost = (m.get("cost") or {}).get("display", "")
        suffix = " est." if (m.get("cost") or {}).get("exact") is False else ""
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(x, top - 13, f"{m.get('status')} · {cost}{suffix} · {m.get('latencyMs')} ms")
        if p and os.path.exists(p):
            fit_image(c, p, x, top - 26 - img_h, col_w, img_h)
        else:
            c.setFillColor(PALE)
            c.rect(x, top - 26 - img_h, col_w, img_h, fill=1, stroke=0)
            draw_wrapped(c, (m.get("error") or {}).get("message", "No output"), x + 10, top - 52, col_w - 20, 8, 11, MUTED)
    footer(c, page_no)


def passport_text(passport):
    contract = passport.get("contract") or passport
    keys = [
        "product_summary",
        "topology",
        "section_geometry",
        "asymmetry",
        "legs",
        "no_equalization_rules",
        "leg_acceptance_criteria",
    ]
    selected = {k: contract.get(k) for k in keys if k in contract}
    if not selected:
        selected = contract
    return json.dumps(selected, ensure_ascii=False, indent=2)[:3600]


def passport_page(c, run_dir, sofa, page_no):
    p = os.path.join(run_dir, "passports", f"sofa-{sofa}.json")
    passport = load_json(p)
    header(c, f"Sofa {sofa} - Sofa Passport excerpt", "Updated passport focuses on geometry, asymmetric sections, no-equalization, and legs.")
    c.setFillColor(INK)
    c.setFont("Helvetica", 7.3)
    y = PAGE_H - 85
    for line in passport_text(passport).splitlines():
        if y < 38:
            break
        c.drawString(M, y, line[:150])
        y -= 9
    footer(c, page_no)


def appendix_page(c, run_dir, sofa, variant, page_no):
    m = manifest_for(run_dir, variant, sofa)
    p = output_path(run_dir, variant, sofa, m)
    cost = (m.get("cost") or {}).get("display", "")
    suffix = " est." if (m.get("cost") or {}).get("exact") is False else ""
    header(c, f"Appendix - Sofa {sofa} / {variant.upper()}", f"{LABELS.get(variant, variant)} · {m.get('status')} · {cost}{suffix} · {m.get('latencyMs')} ms")
    if p and os.path.exists(p):
        fit_image(c, p, M, 45, PAGE_W - 2 * M, PAGE_H - 120)
    else:
        draw_wrapped(c, (m.get("error") or {}).get("message", "No output"), M, PAGE_H - 100, PAGE_W - 2 * M, 10, 14, INK)
    footer(c, page_no)


def main():
    args = parse_args()
    run_dir = os.path.abspath(args.run)
    batch = run_manifest(run_dir)
    sofas = sofa_ids(batch, args.sofas)
    variants = variant_ids(batch, args.variants)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    c = canvas.Canvas(args.out, pagesize=landscape(A4))
    page = 1
    title_page(c, page, batch, variants)
    c.showPage()
    page += 1
    for sofa in sofas:
        sofa_overview(c, run_dir, sofa, variants, page)
        c.showPage()
        page += 1
        passport_page(c, run_dir, sofa, page)
        c.showPage()
        page += 1
    for sofa in sofas:
        for variant in variants:
            appendix_page(c, run_dir, sofa, variant, page)
            c.showPage()
            page += 1
    c.save()
    print(args.out)


if __name__ == "__main__":
    main()
