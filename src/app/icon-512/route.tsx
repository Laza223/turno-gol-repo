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
          borderRadius: 102,
        }}
      >
        <span style={{ color: "white", fontWeight: 900, fontSize: "60%", fontStyle: "italic" }}>TG</span>
      </div>
    ),
    { width: 512, height: 512 },
  )
}
