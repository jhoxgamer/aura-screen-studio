import math
import os
from PIL import Image, ImageDraw, ImageFilter

def create_aura_logo(size=1024):
    # Canvas
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    
    # Base squircle container
    padding = size * 0.07
    rect = [padding, padding, size - padding, size - padding]
    corner_radius = size * 0.22
    
    # Dark Midnight base (#0B1117 = 11, 17, 23)
    base_mask = Image.new("L", (size, size), 0)
    draw_base_mask = ImageDraw.Draw(base_mask)
    draw_base_mask.rounded_rectangle(rect, radius=corner_radius, fill=255)
    
    bg_surface = Image.new("RGBA", (size, size), (11, 17, 23, 255))
    draw_bg = ImageDraw.Draw(bg_surface)
    
    cx, cy = size / 2, size / 2
    # Subtle inner studio glow (#18242E = 24, 36, 46)
    for r in range(int(size * 0.45), 0, -3):
        factor = r / (size * 0.45)
        alpha = int((1.0 - factor) * 40)
        draw_bg.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(24, 36, 46, alpha))
        
    img.paste(bg_surface, (0, 0), base_mask)
    
    # Border (#31414D = 49, 65, 77)
    rim_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_rim = ImageDraw.Draw(rim_img)
    draw_rim.rounded_rectangle(rect, radius=corner_radius, outline=(49, 65, 77, 255), width=int(size * 0.016))
    img.alpha_composite(rim_img)
    
    # Signal Mint Halo Layer (#3AD6C6 = 58, 214, 198)
    glow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_glow = ImageDraw.Draw(glow_layer)
    glow_radius = size * 0.32
    for gr in range(int(glow_radius * 1.3), int(glow_radius * 0.6), -2):
        factor = (gr - glow_radius * 0.6) / (glow_radius * 0.7)
        alpha = int((1.0 - factor) * 35)
        draw_glow.ellipse([cx - gr, cy - gr, cx + gr, cy + gr], fill=(58, 214, 198, alpha))
        
    img.alpha_composite(glow_layer)
    
    # Studio Viewfinder Framing Brackets in Signal Mint (#3AD6C6)
    bracket_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_bracket = ImageDraw.Draw(bracket_layer)
    bracket_w = int(size * 0.038)
    bracket_len = size * 0.14
    margin = size * 0.22
    
    # Top-Left
    draw_bracket.line([(margin, margin + bracket_len), (margin, margin)], fill=(58, 214, 198, 255), width=bracket_w)
    draw_bracket.line([(margin, margin), (margin + bracket_len, margin)], fill=(58, 214, 198, 255), width=bracket_w)
    
    # Top-Right
    draw_bracket.line([(size - margin, margin + bracket_len), (size - margin, margin)], fill=(58, 214, 198, 255), width=bracket_w)
    draw_bracket.line([(size - margin, margin), (size - margin - bracket_len, margin)], fill=(58, 214, 198, 255), width=bracket_w)
    
    # Bottom-Left
    draw_bracket.line([(margin, size - margin - bracket_len), (margin, size - margin)], fill=(58, 214, 198, 255), width=bracket_w)
    draw_bracket.line([(margin, size - margin), (margin + bracket_len, size - margin)], fill=(58, 214, 198, 255), width=bracket_w)
    
    # Bottom-Right
    draw_bracket.line([(size - margin, size - margin - bracket_len), (size - margin, size - margin)], fill=(58, 214, 198, 255), width=bracket_w)
    draw_bracket.line([(size - margin, size - margin), (size - margin - bracket_len, size - margin)], fill=(58, 214, 198, 255), width=bracket_w)
    
    img.alpha_composite(bracket_layer)
    
    # Capture Ring in Signal Mint (#3AD6C6)
    ring_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_ring = ImageDraw.Draw(ring_layer)
    ring_r = size * 0.22
    ring_w = int(size * 0.032)
    draw_ring.ellipse([cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r], 
                      outline=(101, 230, 216, 255), width=ring_w)
    img.alpha_composite(ring_layer)
    
    # Center Focal Recording Core in Coral (#FF5F6D = 255, 95, 109)
    core_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_core = ImageDraw.Draw(core_layer)
    core_radius = size * 0.11
    
    # Coral Glow
    for cr in range(int(core_radius * 1.4), int(core_radius), -1):
        alpha = int((1.0 - (cr - core_radius) / (core_radius * 0.4)) * 90)
        draw_core.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=(255, 95, 109, alpha))
        
    # Core circle
    draw_core.ellipse([cx - core_radius, cy - core_radius, cx + core_radius, cy + core_radius], 
                      fill=(255, 95, 109, 255), outline=(43, 14, 19, 240), width=int(size * 0.015))
                      
    # Specular lens highlight glint (#FFFFFF)
    glint_x, glint_y = cx - core_radius * 0.35, cy - core_radius * 0.35
    glint_r = core_radius * 0.3
    draw_core.ellipse([glint_x - glint_r, glint_y - glint_r, glint_x + glint_r, glint_y + glint_r], 
                      fill=(255, 255, 255, 240))
                      
    img.alpha_composite(core_layer)
    return img

def create_tray_icon(size=256):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    
    # High-contrast framing brackets for tray (#3AD6C6)
    bracket_w = int(size * 0.09)
    bracket_len = size * 0.28
    margin = size * 0.08
    
    # Top-Left
    draw.line([(margin, margin + bracket_len), (margin, margin)], fill=(58, 214, 198, 255), width=bracket_w)
    draw.line([(margin, margin), (margin + bracket_len, margin)], fill=(58, 214, 198, 255), width=bracket_w)
    
    # Top-Right
    draw.line([(size - margin, margin + bracket_len), (size - margin, margin)], fill=(58, 214, 198, 255), width=bracket_w)
    draw.line([(size - margin, margin), (size - margin - bracket_len, margin)], fill=(58, 214, 198, 255), width=bracket_w)
    
    # Bottom-Left
    draw.line([(margin, size - margin - bracket_len), (margin, size - margin)], fill=(58, 214, 198, 255), width=bracket_w)
    draw.line([(margin, size - margin), (margin + bracket_len, size - margin)], fill=(58, 214, 198, 255), width=bracket_w)
    
    # Bottom-Right
    draw.line([(size - margin, size - margin - bracket_len), (size - margin, size - margin)], fill=(58, 214, 198, 255), width=bracket_w)
    draw.line([(size - margin, size - margin), (size - margin - bracket_len, size - margin)], fill=(58, 214, 198, 255), width=bracket_w)
    
    # Recording core dot in Coral (#FF5F6D)
    core_r = size * 0.22
    draw.ellipse([cx - core_r, cy - core_r, cx + core_r, cy + core_r], 
                 fill=(255, 95, 109, 255), outline=(255, 255, 255, 220), width=int(size * 0.04))
                 
    # Glint
    glint_r = core_r * 0.32
    gx = cx - core_r * 0.3
    gy = cy - core_r * 0.3
    draw.ellipse([gx - glint_r, gy - glint_r, gx + glint_r, gy + glint_r], fill=(255, 255, 255, 255))
    return img

def main():
    icons_dir = os.path.abspath(r"D:\clone\2\public\assets\application-icons")
    os.makedirs(icons_dir, exist_ok=True)
    
    print("[1/4] Generating Aura Logo Master Image (1024x1024) in Midnight Signal...")
    master_logo = create_aura_logo(1024)
    
    logo_512 = master_logo.resize((512, 512), Image.Resampling.LANCZOS)
    logo_256 = master_logo.resize((256, 256), Image.Resampling.LANCZOS)
    logo_128 = master_logo.resize((128, 128), Image.Resampling.LANCZOS)
    logo_64 = master_logo.resize((64, 64), Image.Resampling.LANCZOS)
    logo_48 = master_logo.resize((48, 48), Image.Resampling.LANCZOS)
    logo_32 = master_logo.resize((32, 32), Image.Resampling.LANCZOS)
    logo_16 = master_logo.resize((16, 16), Image.Resampling.LANCZOS)
    
    # Save PNGs
    logo_512.save(os.path.join(icons_dir, "app-logo.png"), format="PNG")
    logo_512.save(os.path.join(icons_dir, "aura-logo-512.png"), format="PNG")
    logo_256.save(os.path.join(icons_dir, "aura-logo-256.png"), format="PNG")
    logo_64.save(os.path.join(icons_dir, "favicon.png"), format="PNG")
    print(f"  -> Saved PNG assets in {icons_dir}")
    
    # Save Windows multi-res .ico
    print("[2/4] Generating Windows app-logo.ico multi-resolution icon...")
    app_ico_path = os.path.join(icons_dir, "app-logo.ico")
    master_logo.save(
        app_ico_path, 
        format="ICO", 
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )
    print(f"  -> Saved app-logo.ico ({os.path.getsize(app_ico_path)} bytes)")
    
    # Tray icon
    print("[3/4] Generating Windows System Tray icon...")
    tray_master = create_tray_icon(256)
    tray_32 = tray_master.resize((32, 32), Image.Resampling.LANCZOS)
    tray_16 = tray_master.resize((16, 16), Image.Resampling.LANCZOS)
    
    tray_ico_path = os.path.join(icons_dir, "app-icon-tray.ico")
    tray_master.save(
        tray_ico_path,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64)]
    )
    
    # Tray PNGs
    tray_master.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(icons_dir, "tray-logo-dev@2x.png"), "PNG")
    tray_32.save(os.path.join(icons_dir, "tray-logo-dev.png"), "PNG")
    tray_32.save(os.path.join(icons_dir, "tray-logo-notif-windows.png"), "PNG")
    tray_master.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(icons_dir, "tray-logo-notif-windows@2x.png"), "PNG")
    tray_32.save(os.path.join(icons_dir, "tray-logo-Template.png"), "PNG")
    tray_master.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(icons_dir, "tray-logo-Template@2x.png"), "PNG")
    
    # Copy to public root for web favicons
    public_dir = os.path.abspath(r"D:\clone\2\public")
    logo_64.save(os.path.join(public_dir, "favicon.png"), "PNG")
    logo_32.save(os.path.join(public_dir, "favicon.ico"), "ICO", sizes=[(16, 16), (32, 32)])
    
    print("[4/4] All Aura Screen Studio Midnight Signal icons created successfully!")

if __name__ == "__main__":
    main()
