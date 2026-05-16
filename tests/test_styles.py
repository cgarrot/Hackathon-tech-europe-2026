from gameforge_voice.styles import (
    apply_gradium_text_controls,
    gradium_json_config,
    resolve_speech_style,
)


def test_resolves_named_style_to_gradium_config() -> None:
    style = resolve_speech_style("mysterious")

    assert style is not None
    assert style.emotion == "mysterious"
    assert gradium_json_config(style) == {"temp": 0.8, "padding_bonus": 1.4}
    assert apply_gradium_text_controls("Bonjour.", style).startswith("<break")


def test_structured_style_scales_intensity() -> None:
    low = resolve_speech_style({"emotion": "urgent", "intensity": 0.2})
    high = resolve_speech_style({"emotion": "urgent", "intensity": 1.0})

    assert low is not None
    assert high is not None
    assert abs(high.padding_bonus or 0) > abs(low.padding_bonus or 0)
    assert (high.temperature or 0) > (low.temperature or 0)


def test_structured_style_allows_explicit_overrides() -> None:
    style = resolve_speech_style(
        {
            "emotion": "urgent",
            "intensity": 1.0,
            "padding_bonus": -2.0,
            "pause_after_s": 0.5,
        }
    )

    assert style is not None
    assert gradium_json_config(style)["padding_bonus"] == -2.0
    assert apply_gradium_text_controls("Vite.", style).endswith('<break time="0.5s" />')
