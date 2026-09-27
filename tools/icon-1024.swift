import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
// The original Night Roll icon, redrawn at 1024 (the 512 was scaled up and
// had transparent corners, which App Store Connect rejects). Same shapes:
// a faint grid, three voices as pills, the gold playhead. iOS rounds the
// corners itself, so the square is full-bleed.
let W = 1024.0
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
func color(_ hex: UInt32) -> CGColor { CGColor(colorSpace: cs, components: [Double((hex >> 16) & 255)/255, Double((hex >> 8) & 255)/255, Double(hex & 255)/255, 1])! }
let bg = color(0x0E1222), grid = color(0x171C30), orange = color(0xD86A3A), blue = color(0x5B8DEF), green = color(0x3DBE8C), gold = color(0xD8B65A)
let ctx = CGContext(data: nil, width: Int(W), height: Int(W), bitsPerComponent: 8, bytesPerRow: Int(W) * 4, space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.setFillColor(bg); ctx.fill(CGRect(x: 0, y: 0, width: W, height: W))
ctx.setStrokeColor(grid); ctx.setLineWidth(3)
for i in 1..<10 { let p = Double(i) * W / 10
  ctx.move(to: CGPoint(x: p, y: 0)); ctx.addLine(to: CGPoint(x: p, y: W))
  ctx.move(to: CGPoint(x: 0, y: p)); ctx.addLine(to: CGPoint(x: W, y: p)) }
ctx.strokePath()
// pills: (x0, x1) at 512-scale, per row; rows at y-centre (512-scale, from the top), height 60
func pill(_ x0: Double, _ x1: Double, _ yc: Double, _ col: CGColor) {
  let h = 120.0, y = W - yc * 2 - h / 2 // CoreGraphics is bottom-up
  let r = CGRect(x: x0 * 2, y: y, width: (x1 - x0) * 2, height: h)
  ctx.setFillColor(col); ctx.addPath(CGPath(roundedRect: r, cornerWidth: h / 2, cornerHeight: h / 2, transform: nil)); ctx.fillPath()
}
for (x0, x1) in [(80.0, 208.0), (236.0, 320.0), (348.0, 432.0)] { pill(x0, x1, 185, orange) }
for (x0, x1) in [(110.0, 190.0), (205.0, 365.0)] { pill(x0, x1, 272, blue) }
for (x0, x1) in [(80.0, 160.0), (175.0, 250.0), (265.0, 432.0)] { pill(x0, x1, 358, green) }
ctx.setFillColor(gold); ctx.addPath(CGPath(roundedRect: CGRect(x: 292 * 2, y: W - 440 * 2, width: 24, height: 370 * 2), cornerWidth: 6, cornerHeight: 6, transform: nil)); ctx.fillPath()
let img = ctx.makeImage()!
let out = CommandLine.arguments[1]
let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(d, img, nil); CGImageDestinationFinalize(d)
print("ok")
