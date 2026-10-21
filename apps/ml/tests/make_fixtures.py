"""Generates synthetic demo fixtures (no real people or accounts): a scam chat screenshot and the
BEC invoice used in demo step 5. Run: uv run python tests/make_fixtures.py"""

from pathlib import Path

import pymupdf

OUT = Path(__file__).parent / "fixtures"


def chat_screenshot() -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=390, height=640)
    page.draw_rect(page.rect, color=None, fill=(0.93, 0.90, 0.85))
    page.draw_rect(pymupdf.Rect(0, 0, 390, 56), color=None, fill=(0.0, 0.37, 0.33))
    page.insert_text((16, 34), "Insp. Lim (PDRM Bukit Aman)", fontsize=14, color=(1, 1, 1))
    bubbles = [
        "Selamat petang puan. Saya Inspektor Lim dari\nIPK Bukit Aman. Akaun bank puan terlibat\ndalam kes pengubahan wang haram.",
        "Untuk siasatan, sila pindahkan semua simpanan\nke akaun selamat Bank Negara:\nPublic Bank 6471 2093 5518\nNama: BNM TRUST HOLDINGS",
        "Hubungi saya segera di 011-2345 4821.\nJangan beritahu sesiapa termasuk keluarga.\nKes ini SULIT.",
    ]
    y = 80
    for text in bubbles:
        lines = text.count("\n") + 1
        h = 18 * lines + 16
        page.draw_rect(pymupdf.Rect(12, y, 330, y + h), color=None, fill=(1, 1, 1), radius=0.08)
        page.insert_text((22, y + 20), text, fontsize=12, color=(0.1, 0.1, 0.1))
        y += h + 14
    page.get_pixmap(dpi=144).save(OUT / "scam-chat.png")


def bec_invoice() -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    put = lambda xy, t, s=10, **k: page.insert_text(xy, t, fontsize=s, **k)  # noqa: E731
    put((40, 60), "KELUVRA STEEL SUPPLIES SDN BHD", 16)
    put((40, 78), "(201901023456)  TIN: C2584563200")
    put((40, 92), "Lot 12, Jalan Industri 3, 47100 Puchong, Selangor   Tel: 03-5121 8800")
    put((40, 130), "TAX INVOICE  No: SS-2026-1187        Date: 19 Oct 2026", 12)
    put((40, 150), "Bill to: Majuvista Hardware Sdn Bhd")
    rows = [
        ("Hollow section 50x50x2.0mm (6m)", "120", "312.50", "37,500.00"),
        ("Steel plate 6mm 4'x8'", "40", "1,225.00", "49,000.00"),
    ]
    y = 190
    put((40, y), "Description                                   Qty     Unit (RM)     Amount (RM)")
    for d, q, u, a in rows:
        y += 18
        put((40, y), f"{d:<44}{q:>6}{u:>14}{a:>16}")
    put((40, y + 30), "TOTAL PAYABLE: RM 86,500.00", 12)
    put((40, y + 70), "IMPORTANT NOTICE: Our company has changed bank due to audit.", 11, color=(0.7, 0, 0))
    put((40, y + 86), "Please make payment to our NEW account effective immediately:", 11, color=(0.7, 0, 0))
    put((40, y + 106), "Hong Leong Bank   2290 1847 3365", 12)
    put((40, y + 122), "Account name: Keluvra Steel Supplies")
    put((40, y + 150), "Payment within 24 hours to avoid delivery delay. Contact our finance: 016-221 0934")
    put((40, y + 166), "Email: accounts@keluvra-steel-my.com")
    doc.save(OUT / "bec-invoice.pdf")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    chat_screenshot()
    bec_invoice()
    print("fixtures written to", OUT)
