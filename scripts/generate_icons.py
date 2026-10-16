import math
import os
from PIL import Image, ImageDraw, ImageFilter

def create_aura_logo(size=1024):
    # Create high-res supersampled canvas (1024x1024)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    
    # Base squircle container
    padding = size * 0.08
    rect = [padding, padding, size - padding, size - padding]
    corner_radius = size * 0.22
    
    # Dark obsidian base with subtle inner gradient
    base_mask = Image.new("L", (size, size), 0)
    draw_base_mask = ImageDraw.Draw(base_mask)
    draw_base_mask.rounded_rectangle(rect, radius=corner_radius, fill=255)
    
    # Create dark metallic obsidian gradient for background
    bg_gradient = Image.new("RGBA", (size, size), (12, 15, 24, 255))
    draw_bg = ImageDraw.Draw(bg_gradient)
    
    # Radial highlights in background
    cx, cy = size / 2, size / 2
    for r in range(int(size * 0.5), 0, -2):
        factor = r / (size * 0.5)
        # Top-left illumination
        alpha = int((1.0 - factor) * 45)
        draw_bg.ellipse([cx - r - size*0.05, cy - r - size*0.05, cx + r - size*0.05, cy + r - size*0.05], 
                        fill=(30, 42, 68, alpha))
        
    img.paste(bg_gradient, (0, 0), base_mask)
    
    # Glassy rim border
    rim_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_rim = ImageDraw.Draw(rim_img)
    draw_rim.rounded_rectangle(rect, radius=corner_radius, outline=(255, 255, 255, 40), width=int(size * 0.012))
    img.alpha_composite(rim_img)
    
    # Aura Glow Layer
    glow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_glow = ImageDraw.Draw(glow_layer)
    
    ring_radius_outer = size * 0.35
    ring_radius_inner = size * 0.28
    
    # Draw vibrant cosmic gradient ring using trigonometric steps
    steps = 720
    for i in range(steps):
        angle = (i / steps) * 2 * math.pi
        t = i / steps  # 0 to 1
        
        # Color palette:
        # 0.0 -> Electric Cyan (6, 182, 212)
        # 0.33 -> Royal Indigo (99, 102, 241)
        # 0.66 -> Neon Violet (168, 85, 247)
        # 1.0 -> Hot Pink (236, 72, 153)
        if t < 0.33:
            s = t / 0.33
            r = int(6 * (1-s) + 99 * s)
            g = int(182 * (1-s) + 102 * s)
            b = int(212 * (1-s) + 241 * s)
        elif t < 0.66:
            s = (t - 0.33) / 0.33
            r = int(99 * (1-s) + 168 * s)
            g = int(102 * (1-s) + 85 * s)
            b = int(241 * (1-s) + 247 * s)
        else:
            s = (t - 0.66) / 0.34
            r = int(168 * (1-s) + 236 * s)
            g = int(85 * (1-s) + 72 * s)
            b = int(247 * (1-s) + 153 * s)
            
        x1 = cx + ring_radius_inner * math.cos(angle)
        y1 = cy + ring_radius_inner * math.sin(angle)
        x2 = cx + ring_radius_outer * math.cos(angle)
        y2 = cy + ring_radius_outer * math.sin(angle)
        
        draw_glow.line([x1, y1, x2, y2], fill=(r, g, b, 230), width=int(size * 0.018))
        
    # Soft aura glow blur
    blurred_glow = glow_layer.filter(ImageFilter.GaussianBlur(radius=int(size * 0.035)))
    img.alpha_composite(blurred_glow)
    img.alpha_composite(glow_layer)
    
    # Precision Aperture / Shutter blades in center
    aperture_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_aperture = ImageDraw.Draw(aperture_layer)
    
    # Draw 6 sleek curved aperture blades
    blade_radius = size * 0.27
    num_blades = 6
    for b in range(num_blades):
        angle_start = (b / num_blades) * 2 * math.pi
        blade_angle = angle_start + 0.35
        
        p1 = (cx + (blade_radius * 0.45) * math.cos(angle_start), cy + (blade_radius * 0.45) * math.sin(angle_start))
        p2 = (cx + blade_radius * math.cos(angle_start + 0.5), cy + blade_radius * math.sin(angle_start + 0.5))
        p3 = (cx + (blade_radius * 0.95) * math.cos(angle_start + 0.85), cy + (blade_radius * 0.95) * math.sin(angle_start + 0.85))
        p4 = (cx + (blade_radius * 0.4) * math.cos(angle_start + 0.7), cy + (blade_radius * 0.4) * math.sin(angle_start + 0.7))
        
        draw_aperture.polygon([p1, p2, p3, p4], fill=(22, 28, 44, 210), outline=(99, 102, 241, 160))
        
    img.alpha_composite(aperture_layer)
    
    # Center Focal Recording Core (Glowing recording beacon)
    core_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_core = ImageDraw.Draw(core_layer)
    
    core_radius = size * 0.12
    # Outer glow
    for cr in range(int(core_radius * 1.6), int(core_radius), -1):
        alpha = int((1.0 - (cr - core_radius) / (core_radius * 0.6)) * 90)
        draw_core.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=(6, 182, 212, alpha))
        
    # Core circle with cyan/violet gradient
    draw_core.ellipse([cx - core_radius, cy - core_radius, cx + core_radius, cy + core_radius], 
                      fill=(6, 182, 212, 255), outline=(255, 255, 255, 220), width=int(size * 0.012))
                      
    # Inner recording center red/magenta dot
    inner_dot_r = core_radius * 0.48
    draw_core.ellipse([cx - inner_dot_r, cy - inner_dot_r, cx + inner_dot_r, cy + inner_dot_r], 
                      fill=(244, 63, 94, 255), outline=(255, 255, 255, 200), width=int(size * 0.008))
                      
    # Specular lens highlight glint
    glint_x, glint_y = cx - inner_dot_r * 0.35, cy - inner_dot_r * 0.35
    glint_r = inner_dot_r * 0.35
    draw_core.ellipse([glint_x - glint_r, glint_y - glint_r, glint_x + glint_r, glint_y + glint_r], 
                      fill=(255, 255, 255, 240))
                      
    img.alpha_composite(core_layer)
    return img

def create_tray_icon(size=256):
    # Specialized crisp tray icon with high-contrast glowing cyan aperture ring & recording dot
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    
    # Outer ring
    outer_r = size * 0.44
    inner_r = size * 0.30
    draw.ellipse([cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r], outline=(6, 182, 212, 255), width=int(size * 0.09))
    
    # Iris blades hint
    for i in range(4):
        ang = (i / 4.0) * math.pi
        x1 = cx + (inner_r * 0.7) * math.cos(ang)
        y1 = cy + (inner_r * 0.7) * math.sin(ang)
        x2 = cx + (outer_r * 1.0) * math.cos(ang)
        y2 = cy + (outer_r * 1.0) * math.sin(ang)
        draw.line([x1, y1, x2, y2], fill=(99, 102, 241, 200), width=int(size * 0.04))
        
    # Recording core dot
    core_r = size * 0.16
    draw.ellipse([cx - core_r, cy - core_r, cx + core_r, cy + core_r], fill=(244, 63, 94, 255), outline=(255, 255, 255, 240), width=int(size * 0.03))
    
    # Glint
    glint_r = core_r * 0.35
    gx = cx - core_r * 0.3
    gy = cy - core_r * 0.3
    draw.ellipse([gx - glint_r, gy - glint_r, gx + glint_r, gy + glint_r], fill=(255, 255, 255, 255))
    return img

def main():
    icons_dir = os.path.abspath(r"D:\clone\2\public\assets\application-icons")
    os.makedirs(icons_dir, exist_ok=True)
    
    print("[1/4] Generating Aura Logo Master Image (1024x1024)...")
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
    
    print("[4/4] All Aura Screen Studio icons created successfully!")

if __name__ == "__main__":
    main()
