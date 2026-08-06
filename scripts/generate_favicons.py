"""
Generate favicon variants from the uploaded logo PNG.
- icon-192.png (192x192) - PWA standard
- icon-512.png (512x512) - PWA standard
- apple-touch-icon.png (180x180) - iOS
- favicon.ico (multi-size: 16, 32, 48) - browser tab
- icon.png (512x512) - Next.js app router convention
"""
from PIL import Image
import os

SRC = "/home/z/my-project/scripts/favicon-source.png"
PUBLIC = "/home/z/my-project/public"

# Load source
src = Image.open(SRC).convert("RGBA")
print(f"Source: {src.size}, mode: {src.mode}")

# Resize function
def save_resized(img, size, path, fmt="PNG"):
    img_resized = img.resize((size, size), Image.LANCZOS)
    img_resized.save(path, fmt, optimize=True)
    print(f"  Saved {path} ({size}x{size})")

# Generate PNG variants
save_resized(src, 192, f"{PUBLIC}/icon-192.png")
save_resized(src, 512, f"{PUBLIC}/icon-512.png")
save_resized(src, 512, f"{PUBLIC}/icon.png")  # Next.js app router auto-detect
save_resized(src, 180, f"{PUBLIC}/apple-touch-icon.png")

# Generate favicon.ico (multi-resolution)
sizes = [16, 32, 48]
ico_images = [src.resize((s, s), Image.LANCZOS) for s in sizes]
ico_images[0].save(
    f"{PUBLIC}/favicon.ico",
    format="ICO",
    sizes=[(s, s) for s in sizes],
    append_images=ico_images[1:]
)
print(f"  Saved {PUBLIC}/favicon.ico (multi-size: {sizes})")

# Also place favicon.ico and icon.png in src/app/ for Next.js app router auto-detection
import shutil
shutil.copy(f"{PUBLIC}/icon.png", "/home/z/my-project/src/app/icon.png")
shutil.copy(f"{PUBLIC}/favicon.ico", "/home/z/my-project/src/app/favicon.ico")
print("  Copied icon.png and favicon.ico to src/app/ (Next.js auto-detection)")

print("\n✅ All favicon variants generated successfully!")
print("\nGenerated files:")
for f in ["icon-192.png", "icon-512.png", "icon.png", "apple-touch-icon.png", "favicon.ico"]:
    path = f"{PUBLIC}/{f}"
    if os.path.exists(path):
        print(f"  {path} ({os.path.getsize(path)} bytes)")
