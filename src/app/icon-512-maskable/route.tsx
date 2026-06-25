import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#059669',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* No borderRadius — OS aplica la mask. Mark al ~58% para respetar la safe zone. */}
        <span style={{ color: "white", fontWeight: 900, fontSize: "60%", fontStyle: "italic" }}>TG</span>
      </div>
    ),
    { width: 512, height: 512 },
  )
}
