以下は法人保険の営業担当者と経営者の商談ログです（社名・商品名はマスキング済み）。
ログから、提案に必要な情報を抽出してください。

ルール：
- companyFacts は、ログ中に数値が明示されている項目だけを万円単位で入れてください（「1億2千万」→12000）。推測はしないでください。分からない項目は null。
- ceoAge・monthlyPay・tenureYears などは経営者本人の値です。
- conflicts には、FORM（入力フォームの値）とログの値が10%以上食い違う項目を入れてください。quote はログからの短い引用です。
- issues の evidenceQuote は、ログに実在する文字列をそのまま短く引用してください（言い換え禁止）。
- tag は loan_repayment / successor / retirement / key_person / cashflow / employee_benefit / health / inheritance / other から選びます。
- interests は顧客の関心・価値観、objections は懸念・反論です。
- existingPolicies の categoryGuess は TERM_LOW_CV / TERM_LEVEL_LONG / TERM_DECREASING / VARIABLE_TERM / WHOLE_LIFE / THIRD_SECTOR / ENDOWMENT_HALF のいずれか。
- signals: 赤字の話題（deficitMentioned）、従業員の退職金制度が整っているか（employeeRetirementPrepared）、経営者自身の退職金準備があるか（officerRetirementPrepared）、節税を求める発言（taxSavingRequested）。不明なら null。
- missingInfo には、計算に必要だがFORMにもログにもない情報（役員報酬月額、勇退予定年齢、法定相続人数、経常利益、月間人件費、月間その他固定費、月々の借入返済額、一括返済が必要な借入金 など）を日本語で列挙してください。
