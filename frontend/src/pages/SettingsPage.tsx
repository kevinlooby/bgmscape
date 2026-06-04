import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { saveDefaults, usePlayback } from '../store/playback'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { PageHeader } from '@/ui/PageHeader'
import { SliderRow } from '../components/listener/SliderRow'
import { color, font, fontSize, space, weight } from '@/ui/tokens'

/** Global tuning settings page. Replaces the collapsible Tuning panel that
 *  used to live at the bottom of the listener page. Same sliders, same store
 *  bindings — just promoted to a full page with cards for each group, so the
 *  9 sliders feel approachable instead of dumped in a pile.
 *
 *  Reached by the gear icon in the listener header. Settings are global
 *  (same as before — not per-game). */
export default function SettingsPage() {
  const navigate = useNavigate()

  const {
    dwellVarianceMs, fadeOutDuration, fadeInDuration,
    travelMinMs, travelVarianceMs, musicVolume, ambientBusVolume,
    ambientDensity, ambientCrowdingFalloff, ambientRestMinMs, ambientRestVarianceMs,
    setDwellVarianceMs, setFadeOutDuration, setFadeInDuration,
    setTravelMinMs, setTravelVarianceMs, setMusicVolume, setAmbientBusVolume,
    setAmbientDensity, setAmbientCrowdingFalloff, setAmbientRestMinMs, setAmbientRestVarianceMs,
  } = usePlayback()

  const [savedFlash, setSavedFlash] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [])

  const handleSaveDefaults = () => {
    saveDefaults({
      dwellVarianceMs, fadeOutDuration, fadeInDuration,
      travelMinMs, travelVarianceMs, musicVolume, ambientBusVolume,
      ambientDensity, ambientCrowdingFalloff, ambientRestMinMs, ambientRestVarianceMs,
    })
    setSavedFlash(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedFlash(false), 1500)
  }

  const handleBack = () => {
    // navigate(-1) returns to the previous page (typically the listener); if
    // there's no history (deep-link / fresh tab), fall back to the game grid.
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  const travelMinSecs = travelMinMs / 1000
  const travelVarSecs = travelVarianceMs / 1000

  return (
    <div style={{ minHeight: '100vh', background: color.bg, color: color.textBody }}>
      <PageHeader title="bgmscape" subtitle="settings">
        <Button
          variant="ghost"
          leading={<ArrowLeft size={16} />}
          onClick={handleBack}
        >
          Back
        </Button>
      </PageHeader>

      <div style={{
        maxWidth: 720, margin: '0 auto',
        padding: `${space.xxl}px ${space.xl}px`,
        display: 'flex', flexDirection: 'column', gap: space.lg,
      }}>
        <div>
          <h1 style={{
            margin: 0,
            fontFamily: font.sans,
            fontSize: fontSize.xxl,
            color: color.textPrimary,
            fontWeight: weight.bold,
            letterSpacing: '-0.01em',
          }}>
            Tuning
          </h1>
          <p style={{
            marginTop: space.sm,
            fontFamily: font.sans,
            fontSize: fontSize.md,
            color: color.textMuted,
            lineHeight: 1.55,
          }}>
            Changes apply immediately to the current listen session. Hit
            <em> Save as defaults </em>
            below to persist them across reloads.
          </p>
        </div>

        <Card>
          <SectionTitle>Music</SectionTitle>
          <SliderRow
            label="Volume"
            tooltip="Master volume for the music track. Same slider as the speaker icon in the listener header — they stay in sync."
            value={musicVolume}
            min={0} max={1} step={0.05}
            format={v => v.toFixed(2)}
            onChange={setMusicVolume}
          />
        </Card>

        <Card>
          <SectionTitle>Wander</SectionTitle>
          <SliderRow
            label="Variance"
            tooltip="Random extra time added on top of the track's full length. Each node plays at least once through; variance is added to keep timing from feeling mechanical. Transition nodes ignore this."
            value={dwellVarianceMs / 1000}
            min={0} max={120} step={5}
            format={v => `${v}s`}
            onChange={v => setDwellVarianceMs(v * 1000)}
          />
          <Footnote>dwell = track length + 0–{Math.round(dwellVarianceMs / 1000)}s</Footnote>
        </Card>

        <Card>
          <SectionTitle>Transitions</SectionTitle>
          <SliderRow
            label="Fade out"
            tooltip="How long the current track fades to silence before the next one starts."
            value={fadeOutDuration}
            min={0.1} max={8} step={0.1}
            format={v => `${v.toFixed(1)}s`}
            onChange={setFadeOutDuration}
          />
          <SliderRow
            label="Fade in"
            tooltip="How long the next track fades in from silence after the previous one stops."
            value={fadeInDuration}
            min={0.1} max={8} step={0.1}
            format={v => `${v.toFixed(1)}s`}
            onChange={setFadeInDuration}
          />
        </Card>

        <Card>
          <SectionTitle>Travel time</SectionTitle>
          <SliderRow
            label="Travel min"
            tooltip="Minimum silent period between wander transitions — simulates the listener moving between locations. Teleport is unaffected."
            value={travelMinSecs}
            min={0} max={30} step={0.5}
            format={v => `${v.toFixed(1)}s`}
            onChange={v => setTravelMinMs(v * 1000)}
          />
          <SliderRow
            label="Travel variance"
            tooltip="Random extra silence on top of the minimum. Prevents travel feeling mechanical. Set to 0 for a fixed travel period."
            value={travelVarSecs}
            min={0} max={20} step={0.5}
            format={v => `${v.toFixed(1)}s`}
            onChange={v => setTravelVarianceMs(v * 1000)}
          />
          <Footnote>
            range: {travelMinSecs.toFixed(1)}s – {(travelMinSecs + travelVarSecs).toFixed(1)}s
          </Footnote>
        </Card>

        <Card>
          <SectionTitle>Ambient layer</SectionTitle>
          <SliderRow
            label="Volume"
            tooltip="Master volume for the ambient/atmospheric layer (wind, water, fauna, …). Multiplicative with the overall master volume."
            value={ambientBusVolume}
            min={0} max={1} step={0.05}
            format={v => v.toFixed(2)}
            onChange={setAmbientBusVolume}
          />
          <SliderRow
            label="Density"
            tooltip="How likely a matching ambient sound starts at all. Lower = sparser soundscape; 0 = ambient off. Combines with each asset's own probability."
            value={ambientDensity}
            min={0} max={1} step={0.05}
            format={v => v.toFixed(2)}
            onChange={setAmbientDensity}
          />
          <SliderRow
            label="Layering"
            tooltip="How readily ambient sounds stack. Each sound already playing multiplies the chance of adding another by this amount. Low = rarely more than one at a time; 1 = no limit on stacking."
            value={ambientCrowdingFalloff}
            min={0} max={1} step={0.05}
            format={v => v.toFixed(2)}
            onChange={setAmbientCrowdingFalloff}
          />
          <SliderRow
            label="Rest min"
            tooltip="Minimum silence for a category after one of its sounds ends, before another may start. Higher = more quiet stretches between ambient sounds."
            value={ambientRestMinMs / 1000}
            min={0} max={60} step={1}
            format={v => `${v.toFixed(0)}s`}
            onChange={v => setAmbientRestMinMs(v * 1000)}
          />
          <SliderRow
            label="Rest variance"
            tooltip="Random extra rest on top of the minimum, so sounds don't return on a fixed clock. Set to 0 for a fixed rest period."
            value={ambientRestVarianceMs / 1000}
            min={0} max={60} step={1}
            format={v => `${v.toFixed(0)}s`}
            onChange={v => setAmbientRestVarianceMs(v * 1000)}
          />
          <Footnote>
            rest: {(ambientRestMinMs / 1000).toFixed(0)}s – {((ambientRestMinMs + ambientRestVarianceMs) / 1000).toFixed(0)}s between sounds
          </Footnote>
        </Card>

        {/* Save bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: space.md,
          padding: `${space.lg}px 0`,
        }}>
          <Button variant="primary" size="md" onClick={handleSaveDefaults}>
            Save as defaults
          </Button>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: font.sans,
            fontSize: fontSize.sm,
            color: color.success,
            opacity: savedFlash ? 1 : 0,
            transition: 'opacity 0.3s',
          }}>
            <Check size={14} /> saved
          </span>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: font.sans,
      fontSize: fontSize.lg,
      color: color.textPrimary,
      fontWeight: weight.bold,
      marginBottom: space.md,
      letterSpacing: '-0.01em',
    }}>
      {children}
    </div>
  )
}

function Footnote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: space.sm,
      fontFamily: font.sans,
      fontSize: fontSize.xs,
      color: color.textFaint,
    }}>
      {children}
    </div>
  )
}
