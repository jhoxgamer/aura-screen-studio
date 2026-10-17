import math
import os
from PIL import Image, ImageDraw, ImageFilter

def create_aura_logo(size=1024):
    # Canvas
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    
    # Outer base squircle container
    padding = size * 0.05
    rect = [padding, padding, size - padding, size - padding]
    corner_radius = size * 0.22
    
    # Base graphite mask (#0B0E14 = 11, 14, 20)
    base_mask = Image.new("L", (size, size), 0)
    draw_base_mask = ImageDraw.Draw(base_mask)
    draw_base_mask.rounded_rectangle(rect, radius=corner_radius, fill=255)
    
    bg_surface = Image.new("RGBA", (size, size), (11, 14, 20, 255))
    img.paste(bg_surface, (0, 0), base_mask)
    
    # Subtle graphite outer border (#303A4B = 48, 58, 75)
    rim_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_rim = ImageDraw.Draw(rim_img)
    draw_rim.rounded_rectangle(rect, radius=corner_radius, outline=(48, 58, 75, 255), width=int(size * 0.02))
    img.alpha_composite(rim_img)
    
    cx, cy = size / 2, size / 2

    # Screen Viewfinder Rectangle in Nocturne Blue (#78A5FF = 120, 165, 255)
    screen_padding = size * 0.18
    screen_rect = [screen_padding, screen_padding, size - screen_padding, size - screen_padding]
    screen_radius = size * 0.14
    
    # Screen inner fill (#121722 = 18, 23, 34)
    screen_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_screen = ImageDraw.Draw(screen_layer)
    draw_screen.rounded_rectangle(screen_rect, radius=screen_radius, fill=(18, 23, 34, 255), 
                                 outline=(120, 165, 255, 255), width=int(size * 0.045))
    img.alpha_composite(screen_layer)
    
    # Viewfinder Corner Precision Brackets (#9AB9FF = 154, 185, 255)
    bracket_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_bracket = ImageDraw.Draw(bracket_layer)
    bracket_w = int(size * 0.026)
    bracket_len = size * 0.10
    bm = size * 0.25
    
    # Top-Left
    draw_bracket.line([(bm, bm + bracket_len), (bm, bm)], fill=(154, 185, 255, 255), width=bracket_w)
    draw_bracket.line([(bm, bm), (bm + bracket_len, bm)], fill=(154, 185, 255, 255), width=bracket_w)
    
    # Top-Right
    draw_bracket.line([(size - bm, bm + bracket_len), (size - bm, bm)], fill=(154, 185, 255, 255), width=bracket_w)
    draw_bracket.line([(size - bm, bm), (size - bm - bracket_len, bm)], fill=(154, 185, 255, 255), width=bracket_w)
    
    # Bottom-Left
    draw_bracket.line([(bm, size - bm - bracket_len), (bm, size - bm)], fill=(154, 185, 255, 255), width=bracket_w)
    draw_bracket.line([(bm, size - bm), (bm + bracket_len, size - bm)], fill=(154, 185, 255, 255), width=bracket_w)
    
    # Bottom-Right
    draw_bracket.line([(size - bm, size - bm - bracket_len), (size - bm, size - bm)], fill=(154, 185, 255, 255), width=bracket_w)
    draw_bracket.line([(size - bm, size - bm), (size - bm - bracket_len, size - bm)], fill=(154, 185, 255, 255), width=bracket_w)
    
    img.alpha_composite(bracket_layer)
    
    # Center Focal Recording Core in Coral (#FF647C = 255, 100, 124)
    core_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_core = ImageDraw.Draw(core_layer)
    core_radius = size * 0.135
    
    # Core circle with contrast ring (#101A32 = 16, 26, 50)
    draw_core.ellipse([cx - core_radius, cy - core_radius, cx + core_radius, cy + core_radius], 
                      fill=(255, 100, 124, 255), outline=(16, 26, 50, 240), width=int(size * 0.02))
                      
    # Specular lens highlight glint (#FFFFFF)
    glint_x, glint_y = cx - core_radius * 0.35, cy - core_radius * 0.35
    glint_r = core_radius * 0.28
    draw_core.ellipse([glint_x - glint_r, glint_y - glint_r, glint_x + glint_r, glint_y + glint_r], 
                      fill=(255, 255, 255, 240))
                      
    img.alpha_composite(core_layer)
    return img

def create_tray_icon(size=256):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    
    # High-contrast framing brackets for tray in Nocturne Blue (#78A5FF = 120, 165, 255)
    bracket_w = int(size * 0.09)
    bracket_len = size * 0.28
    margin = size * 0.08
    
    # Top-Left
    draw.line([(margin, margin + bracket_len), (margin, margin)], fill=(120, 165, 255, 255), width=bracket_w)
    draw.line([(margin, margin), (margin + bracket_len, margin)], fill=(120, 165, 255, 255), width=bracket_w)
    
    # Top-Right
    draw.line([(size - margin, margin + bracket_len), (size - margin, margin)], fill=(120, 165, 255, 255), width=bracket_w)
    draw.line([(size - margin, margin), (size - margin - bracket_len, margin)], fill=(120, 165, 255, 255), width=bracket_w)
    
    # Bottom-Left
    draw.line([(margin, size - margin - bracket_len), (margin, size - margin)], fill=(120, 165, 255, 255), width=bracket_w)
    draw.line([(margin, size - margin), (margin + bracket_len, size - margin)], fill=(120, 165, 255, 255), width=bracket_w)
    
    # Bottom-Right
    draw.line([(size - margin, size - margin - bracket_len), (size - margin, size - margin)], fill=(120, 165, 255, 255), width=bracket_w)
    draw.line([(size - margin, size - margin), (size - margin - bracket_len, size - margin)], fill=(120, 165, 255, 255), width=bracket_w)
    
    # Recording core dot in Coral (#FF647C = 255, 100, 124)
    core_r = size * 0.22
    draw.ellipse([cx - core_r, cy - core_r, cx + core_r, cy + core_r], 
                 fill=(255, 100, 124, 255), outline=(255, 255, 255, 220), width=int(size * 0.04))
                 
    # Glint
    glint_r = core_r * 0.32
    gx = cx - core_r * 0.3
    gy = cy - core_r * 0.3
    draw.ellipse([gx - glint_r, gy - glint_r, gx + glint_r, gy + glint_r], fill=(255, 255, 255, 255))
    return img

def main():
    icons_dir = os.path.abspath(r"D:\clone\2\public\assets\application-icons")
    os.makedirs(icons_dir, exist_ok=True)
    
    print("[1/4] Generating Aura Logo Master Image (1024x1024) in Nocturne Blue...")
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
    
    print("[4/4] All Aura Screen Studio Nocturne Blue icons created successfully!")

if __name__ == "__main__":
    main()
