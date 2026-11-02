# 社訓ドリブン

社訓を自由文で書くと、社員がその通りに会社を回し始める経営シミュレーション（試作中）。

- 仕様書：[SPEC.md](SPEC.md)
- 実装計画：[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
- プレイ（GitHub Pages）：https://higurashi-999.github.io/shakun-driven/

## 状態

- M0（土台）：画面遷移・保存・APIキー設定と接続テストまで
- 以降のマイルストーンは実装計画を参照

## 技術メモ

- 素のHTML/CSS/JavaScript（ビルドなし）、状態は端末内 localStorage
- LLMはBYOK（プレイヤー自身のAPIキー、端末外に送らない）
- push前に `scripts/check.sh` で静的チェックを通す
