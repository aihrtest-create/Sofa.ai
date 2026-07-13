from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
import json, os, textwrap

ROOT = '/Users/dima/Documents/Sofa.ai'
RUN = os.path.join(ROOT, 'qa/generation/2026-07-02T19-18-17-166Z-model-benchmark-ugcHerringboneLiving-full')
OUT = os.path.join(ROOT, 'output/pdf/sofa-ai-6-shot-preview-benchmark.pdf')
SOFAS = ['1','2','3','4','5','6']
VARIANTS = ['a1','b1','c1']
LABELS = {
    'a1': 'A1 - OpenAI gpt-image-2',
    'b1': 'B1 - Gemini 3.1 Flash Image / Vertex',
    'c1': 'C1 - Gemini 3 Pro Image / Vertex',
}
DESC = {
    'a1': 'Gemini Passport -> OpenAI contact sheet',
    'b1': 'Gemini Passport -> Vertex Flash Image',
    'c1': 'Gemini Passport -> Vertex Pro Image',
}
PAGE_W, PAGE_H = landscape(A4)
M = 30
OXBLOOD = colors.HexColor('#651f1d')
INK = colors.HexColor('#221f1d')
MUTED = colors.HexColor('#716963')
PAPER = colors.HexColor('#fbf7ef')
LINE = colors.HexColor('#d8cec3')

font_paths = [
    '/Users/dima/Documents/Sofa.ai/node_modules/@fontsource/manrope/files/manrope-latin-400-normal.woff',
    '/Users/dima/Documents/Sofa.ai/node_modules/@fontsource/manrope/files/manrope-cyrillic-400-normal.woff',
]
# ReportLab cannot read woff reliably. Use built-in Helvetica for robustness.


def read_manifest(variant, sofa):
    p = os.path.join(RUN, 'runs', variant, f'sofa-{sofa}', 'manifest.json')
    with open(p, 'r', encoding='utf-8') as f:
        return json.load(f)


def image_path(manifest, variant, sofa):
    return os.path.join(RUN, 'runs', variant, f'sofa-{sofa}', manifest['outputs'][0]['path'])


def draw_wrapped(c, text, x, y, width, size=9, leading=12, color=MUTED):
    c.setFont('Helvetica', size)
    c.setFillColor(color)
    chars = max(12, int(width / (size * 0.5)))
    for line in textwrap.wrap(text, chars):
        c.drawString(x, y, line)
        y -= leading
    return y


def fit_image(c, path, x, y, w, h, border=True):
    img = Image.open(path)
    iw, ih = img.size
    scale = min(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    dx, dy = x + (w - dw) / 2, y + (h - dh) / 2
    if border:
        c.setStrokeColor(LINE)
        c.setLineWidth(0.7)
        c.rect(x, y, w, h, stroke=1, fill=0)
    c.drawImage(ImageReader(img), dx, dy, dw, dh, preserveAspectRatio=True, mask='auto')


def header(c, title, subtitle=None):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(OXBLOOD)
    c.setFont('Helvetica-Bold', 16)
    c.drawString(M, PAGE_H - 34, title)
    if subtitle:
        c.setFillColor(MUTED)
        c.setFont('Helvetica', 9)
        c.drawString(M, PAGE_H - 50, subtitle)
    c.setStrokeColor(LINE)
    c.line(M, PAGE_H - 60, PAGE_W - M, PAGE_H - 60)


def footer(c, page_no):
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 8)
    c.drawRightString(PAGE_W - M, 18, f'Page {page_no}')


def title_page(c, page_no, totals):
    header(c, 'Sofa.ai 6-Shot Preview Benchmark', 'Completed subset: Sofa 1-6. Full contact sheets only. No final generation.')
    y = PAGE_H - 95
    c.setFillColor(INK)
    c.setFont('Helvetica-Bold', 12)
    c.drawString(M, y, 'What this report compares')
    y -= 20
    y = draw_wrapped(c, 'A1, B1 and C1 all use the same Gemini Sofa Passport and the same UGC living-room preset. The model being compared is the contact-sheet generator: OpenAI gpt-image-2, Gemini 3.1 Flash Image via Vertex, and Gemini 3 Pro Image via Vertex.', M, y, PAGE_W - 2*M, 9, 13, INK)
    y -= 12
    c.setFont('Helvetica-Bold', 12)
    c.setFillColor(INK)
    c.drawString(M, y, 'Cost and latency summary')
    y -= 24
    col_x = [M, M+170, M+300, M+430, M+570]
    headers = ['Variant', 'Sheets', 'Total cost', 'Avg cost', 'Avg latency']
    c.setFont('Helvetica-Bold', 9)
    c.setFillColor(OXBLOOD)
    for x, h in zip(col_x, headers): c.drawString(x, y, h)
    y -= 12
    c.setStrokeColor(LINE); c.line(M, y+6, PAGE_W-M, y+6)
    c.setFont('Helvetica', 9); c.setFillColor(INK)
    for v in VARIANTS:
        t = totals[v]
        c.drawString(col_x[0], y, LABELS[v])
        c.drawRightString(col_x[1]+40, y, str(t['count']))
        c.drawRightString(col_x[2]+70, y, f"${t['usd']:.4f}" + (' est.' if v != 'a1' else ''))
        c.drawRightString(col_x[3]+70, y, f"${(t['usd']/max(1,t['count'])):.4f}" + (' est.' if v != 'a1' else ''))
        c.drawRightString(col_x[4]+70, y, f"{round(t['latency']/max(1,t['count']))} ms")
        y -= 18
    y -= 10
    c.setFillColor(INK); c.setFont('Helvetica-Bold', 12); c.drawString(M, y, 'Read this first')
    y -= 20
    y = draw_wrapped(c, 'The outputs are visually closer than expected. The shared product passport, fixed room preset and strict 6-shot layout dominate the result. This report is still useful for comparing cost, speed and obvious product-fidelity failures, but the next benchmark should compare cropped tiles or loosen composition constraints.', M, y, PAGE_W - 2*M, 9, 13, INK)
    footer(c, page_no)


def sofa_overview(c, sofa, page_no):
    header(c, f'Sofa {sofa} - Side-by-side overview', 'Each image is a full 6-shot preview contact sheet: Hero, Front, Depth, Detail, Elevated, Room.')
    top = PAGE_H - 88
    col_gap = 12
    col_w = (PAGE_W - 2*M - 2*col_gap) / 3
    img_h = 235
    for idx, v in enumerate(VARIANTS):
        x = M + idx * (col_w + col_gap)
        m = read_manifest(v, sofa)
        p = image_path(m, v, sofa)
        c.setFillColor(OXBLOOD)
        c.setFont('Helvetica-Bold', 10)
        c.drawString(x, top, v.upper())
        c.setFillColor(INK)
        c.setFont('Helvetica', 8)
        c.drawString(x + 28, top, LABELS[v].replace(f'{v.upper()} - ', ''))
        cost = m.get('cost', {}).get('display', '')
        suffix = ' est.' if m.get('cost', {}).get('exact') is False else ''
        c.setFillColor(MUTED)
        c.setFont('Helvetica', 8)
        c.drawString(x, top - 13, f"Cost: {cost}{suffix}   Latency: {m.get('latencyMs')} ms")
        fit_image(c, p, x, top - 26 - img_h, col_w, img_h)
        draw_wrapped(c, DESC[v], x, top - 45 - img_h, col_w, 7.5, 10, MUTED)
    footer(c, page_no)


def appendix_page(c, sofa, variant, page_no):
    m = read_manifest(variant, sofa)
    p = image_path(m, variant, sofa)
    cost = m.get('cost', {}).get('display', '')
    suffix = ' est.' if m.get('cost', {}).get('exact') is False else ''
    header(c, f'Appendix - Sofa {sofa} / {variant.upper()}', f"{LABELS[variant]} · Cost {cost}{suffix} · Latency {m.get('latencyMs')} ms")
    fit_image(c, p, M, 45, PAGE_W - 2*M, PAGE_H - 120)
    footer(c, page_no)


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    totals = {v: {'usd': 0.0, 'count': 0, 'latency': 0} for v in VARIANTS}
    for sofa in SOFAS:
        for v in VARIANTS:
            m = read_manifest(v, sofa)
            totals[v]['usd'] += float((m.get('cost') or {}).get('usd') or 0)
            totals[v]['count'] += 1
            totals[v]['latency'] += int(m.get('latencyMs') or 0)
    c = canvas.Canvas(OUT, pagesize=landscape(A4))
    page = 1
    title_page(c, page, totals); c.showPage(); page += 1
    for sofa in SOFAS:
        sofa_overview(c, sofa, page); c.showPage(); page += 1
    for sofa in SOFAS:
        for v in VARIANTS:
            appendix_page(c, sofa, v, page); c.showPage(); page += 1
    c.save()
    print(OUT)

if __name__ == '__main__':
    main()
