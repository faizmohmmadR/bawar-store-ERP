# Localization

The `fa` translation catalog is Afghan Dari, not Iranian Farsi. Keep the internal `fa` language key so existing saved preferences and translation lookups continue to work. Use `fa-AF` for browser locale formatting and document language. The language picker calls this language «دری».

Use clear Afghan business terminology consistently:

| English | Afghan Dari |
| --- | --- |
| Loan | قرضه |
| Bill / invoice | بل |
| Salary | معاش |
| Expenses | مصارف |
| Warehouse | گدام |
| Profit / loss | مفاد / ضرر |
| Dollar | دالر |
| Kilogram | کیلوگرام |
| Information | معلومات |
| Leave | رخصتی |

Preserve financial meanings: salary is «معاش»; equity remains «حقوق صاحبان سهام». Do not translate keys, alter interpolation placeholders, or change English/Pashto catalogs while editing Dari. Afghan Solar Hijri month names come from the existing Afghan calendar locales.
