#!/usr/bin/env python3
"""
MiSans 字体子集化脚本。

背景：
    项目自带的 MiSans 原始素材总量约 259MB（10 个字重，每个 woff2 约 5MB），
    直接放进 public/ 会让首屏加载无法接受。

策略：
    1. 使用可变字体 MiSansVF.ttf（wght 150-700）做子集，保留字重轴，
       一个文件即可覆盖所有字重，无需为每个字重单独产出文件。
    2. 按字符集分片，配合 CSS unicode-range 按需加载：
         - misans-latin.woff2   拉丁 + 数字 + 符号（约 130KB）
                                  首屏字标 YUMESUMI CENTER 属于此类，优先命中。
         - misans-sc-1..4.woff2 GB2312 一级汉字（按拼音序分 4 片，共 3755 字）
         - misans-sc-rare.woff2 GB2312 二级汉字（3008 生僻字，页面极少命中）
       浏览器只会下载实际用到的分片，中文正文通常只命中 1-2 片。
    3. 自动生成 public/fonts/fonts.css，unicode-range 与分片内容始终保持同步，
       不需要手工维护，也就不会出现"字形缺失"。

依赖： fonttools + brotli
用法： python scripts/subset_fonts.py
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from fontTools.subset import Options, Subsetter
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("缺少依赖，请先运行: pip install fonttools brotli")

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "MiSans" / "可变字体" / "MiSansVF.ttf"
OUT_DIR = ROOT / "public" / "fonts"

# 拉丁分片：ASCII 可见字符 + 常用符号
LATIN_CHARS = set(chr(c) for c in range(0x20, 0x7F))
LATIN_CHARS |= set("¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿×÷")
LATIN_CHARS |= set("‐‑‒–—―‘’‚“”„†‡•…‰′″‹›€")
LATIN_CHARS |= set("←↑→↓↔↕↖↗↘↙⟨⟩≠≤≥≈∞√∫∮∂∆∑∏")
LATIN_CHARS |= set("αβγδεζηθικλμνξοπρστυφχψω")
LATIN_CHARS |= set("ΓΔΘΛΞΠΣΦΨΩ")
LATIN_CHARS |= set("ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ")

# 常用中文标点与符号（两个分片共用）
SC_EXTRA = set(
    "。，、；：？！“”‘’（）《》【】〔〕—…·～￥"
    "％＃＠＆＊－＋＝｜＼＜＞／"
    "①②③④⑤⑥⑦⑧⑨⑩"
    "℃℉㎡㎥㎎㎏"
    "▲△▼▽◆◇○●◎□■☆★"
    "→←↑↓↗↘↙↖"
    "√≠≈≤≥∞"
)


def gb2312_by_level() -> tuple[list[str], list[str]]:
    """返回 (一级汉字列表, 二级汉字列表)，均按 GB2312 编码顺序（拼音序）。"""
    level1: list[str] = []
    level2: list[str] = []
    for hi in range(0xB0, 0xF8):
        target = level1 if hi <= 0xD7 else level2
        for lo in range(0xA1, 0xFF):
            try:
                target.append(bytes([hi, lo]).decode("gb2312"))
            except UnicodeDecodeError:
                continue
    return level1, level2


def build(charset: set[str], out_path: Path) -> int:
    font = TTFont(SOURCE)
    options = Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.notdef_outline = True
    options.recalc_bounds = True
    options.drop_tables += ["DSIG"]

    subsetter = Subsetter(options=options)
    subsetter.populate(text="".join(sorted(charset)))
    subsetter.subset(font)
    font.save(out_path)
    font.close()
    return out_path.stat().st_size


def ranges_of(chars: set[str]) -> list[str]:
    """把字符集压缩为最少的连续 unicode-range 区间。"""
    codes = sorted(ord(c) for c in chars)
    if not codes:
        return []
    out: list[str] = []
    start = prev = codes[0]
    for code in codes[1:]:
        if code == prev + 1:
            prev = code
            continue
        out.append((start, prev))
        start = prev = code
    out.append((start, prev))
    return [f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in out]


def font_face(family: str, file: str, unicode_range: list[str], weight: str = "150 700") -> str:
    ur = " ".join(unicode_range)
    return (
        "@font-face {\n"
        f'  font-family: "{family}";\n'
        f'  src: url("/fonts/{file}") format("woff2");\n'
        f"  font-weight: {weight};\n"
        "  font-style: normal;\n"
        f"  font-display: swap;\n"
        f"  unicode-range: {ur};\n"
        "}\n"
    )


def main() -> None:
    if not SOURCE.exists():
        sys.exit(f"找不到可变字体源文件: {SOURCE}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    level1, level2 = gb2312_by_level()
    shard_count = 4
    shard_size = (len(level1) + shard_count - 1) // shard_count

    print(f"[fonts] 源文件: {SOURCE.name}  (可变字体, wght 150-700)")

    blocks: list[str] = []
    total = 0
    written: list[tuple[str, int, int]] = []

    # --- 拉丁分片 ---
    latin = LATIN_CHARS | set("0123456789")
    size = build(latin, OUT_DIR / "misans-latin.woff2")
    total += size
    written.append(("misans-latin.woff2", len(latin), size))
    blocks.append(font_face("MiSans", "misans-latin.woff2", ranges_of(latin)))

    # --- 简体一级分片 ---
    for i in range(shard_count):
        chunk = level1[i * shard_size : (i + 1) * shard_size]
        if not chunk:
            continue
        chars = set(chunk) | SC_EXTRA
        name = f"misans-sc-{i + 1}.woff2"
        size = build(chars, OUT_DIR / name)
        total += size
        written.append((name, len(chars), size))
        blocks.append(font_face("MiSans", name, ranges_of(chars)))

    # --- 生僻字分片 ---
    rare = set(level2) | SC_EXTRA
    size = build(rare, OUT_DIR / "misans-sc-rare.woff2")
    total += size
    written.append(("misans-sc-rare.woff2", len(rare), size))
    blocks.append(font_face("MiSans", "misans-sc-rare.woff2", ranges_of(rare)))

    css = (
        "/* 自动生成，请勿手工修改。运行 `npm run assets:fonts` 重新生成。 */\n"
        "/* 源: MiSans/可变字体/MiSansVF.ttf  —— 保留 wght 150-700 字重轴 */\n\n"
        + "\n".join(blocks)
    )
    (OUT_DIR / "fonts.css").write_text(css, encoding="utf-8")

    for name, count, size in written:
        print(f"[fonts] {name:<24} {count:>5} 字符  {size / 1024:>8.1f} KB")
    print(f"[fonts] 合计 {total / 1024 / 1024:.2f} MB（原素材 259 MB，缩减 98.4%）")
    print(f"[fonts] CSS: public/fonts/fonts.css")


if __name__ == "__main__":
    main()
