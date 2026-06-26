# Шатахуун ERP — Дутуу функцийн бүрэн жагсаалт (114)

8 домэйн шинжээчийн нэгдсэн шүүмж · 🔴critical 🟠high 🟡medium ⚪low · 🇲🇳 = Монголд тусгайлан хамаатай

## 🔴 CRITICAL (29)

**1. Forecourt pump/nozzle control API**
Professional gas station networks (Shell/BP/NIC tier) require real-time pump/dispenser automation: enable/disable pumps per fuel grade/tank, handle preset sales (preset liters/amount), stop/start commands. Without this, POS sales are manual cash-register only—no actual fueling workflow integration. System has Pump/Nozzle models (5 fields) but zero control logic, no device communication layer, no pump status tracking.

**2. Prepay/postpay workflow enforcement in POS**
FuelSaleMode enum (PREPAY/POSTPAY) exists in DB but POS logic doesn't enforce: prepay=customer pays → system sends preset amount to pump → customer pumps; postpay=pump runs → customer swipes card → system reconciles. Currently, POS accepts sales without forcing workflow—meter reading at sale time is manual, not automated from pump. Nozzle meter readings captured at shift open/close only, not per-transaction.

**3. Drive-off prevention (forecourt reconciliation)**
No detection/alert when customer leaves without paying (common $500–5000/month loss per station). System should compare: nozzle meter reading delta vs sale amount in real time. Missing: auto-lock pump at fuel cutoff, reconcile per-transaction, alert on variance >threshold, track repeat offenders (license plate OCR not needed, but behavioral flagging essential).

**4. ATG (Automatic Tank Gauging) integration**
TankReading model supports 'source: "atg" | "manual"' but zero integration code. Professional stations have ATG devices (VEEDER/Gilbarco/Wayne) that send tank level, temperature, water level every 15–30 min. System requires: device connection (Modbus/HTTP), data validation (reasonable deltas), hypertable ingestion (TimescaleDB), reconciliation alerts. Without this, fuel inventory is unreliable—cannot detect leaks, tampering, or gauge failures.

**5. Dry run detection (fuel inventory mismatch alert)**
No active monitoring for tank dry-run (pump still dispenses after tank empty—safety+compliance risk). Missing: tank level vs pump cutoff interlock, pressure sensor data, auto-alert when tank <min threshold. Currently only `FuelTank.minLiters` field exists; no enforcement or real-time alert system.

**6. No Volume Correction (VCF) or Temperature-Density Compensation** 🇲🇳
Fuel volume varies significantly with temperature (±0.1%/°C). The schema stores `temperatureC` in TankReading but NEVER applies ASTM D1250 / ISO 15270 volume correction factors. Book vs. physical reconciliation is mathematically incorrect without this—a 10°C variance can cause 2-3% inventory error. Regulatory requirement for ISO fuel accounting.

**7. Missing Evaporation Loss Tracking**
Fuel evaporates 0.3–0.8%/day depending on tank design, temperature, and weather. System records 'LOSS' in StockMovementType but provides zero evaporation baseline, weather data, or allowance mechanisms. Manifests as unexplained inventory gaps falsely attributed to theft/error. International fuel accounting requires evaporation quantification.

**8. Time Clock / Biometric Attendance**
Шатахуун станцын кассчин, салбарын менежер, цалингийн тооцооны үндэс болох үндсэн функц. Attendance нь Prisma-д байгаа (Employee→Attendance), гэхдээ clock-in/out эхлүүлэх endpoint, biometric/RFID сонгож авуулах хэлбүүр, хэм шалгах механизм байхгүй. Offline эсвэл terminal дээр хүн бүр clock хийх ёстой.

**9. Staff Scheduling / Rota Management**
Ээлж (Shift) модель байгаа боловч энэ нь ӨНӨӨ ээлжийн борлуулалт/нөөцийн логик юм. Долоо хоног/сар эвлүүлэх хуваарь, баруун нь хэнийг хэзээ нээх (request-open), менежер нээлтийг батлах (approve-open) нь байгаа. Гэхдээ календар ухиж чимээ сонсох (schedule collision, min staff per shift, lunch breaks, off days) байхгүй. Шатахуун станц 24/7 идэвхтэй тул ээлжийн хуваарь бүр цувдах ёстой.

**10. Payroll / Salary Calculation** 🇲🇳
Салбарын үндсэн функц. Employee model-д firstName, lastName, hiredAt байгаа л. Цалины бодолт (base salary, overtime, bonuses, deductions НДШ/ХХОАТ Монголын хуль ёсны дагуу) ямар логик ч байхгүй. Худалдан авлагаас комисс, нэмэлт урамшуулал эмпирик буюу ээлжийн гүйцэтгэлтэй хисэх ёстой. Энэ нь борлуулалтын систем дээр sitting-ийг хүүдэж орон нь хохирох цөм ажил юм.

**11. Payroll Tax Deductions (NDSh/KhKhOAT)** 🇲🇳
Монголын хуульд НДШ (13%) + ХХОАТ (11.5% эмпллоер)/10.5% (employee share) сүүд/шилжүүлэг байх ёстой. Салбарын цалингийн тооцооны эмпирик асуудлыг шийдэхийн тулд tax calculation, payroll register (сар бүрийн NDS-гүй, ХХОАТ-ийн батлуулах сонцох), БҮХ ажилтны сар нэмсэн дүн байхаас зайлшгүй юм.

**12. General Ledger (GL) & Chart of Accounts** 🇲🇳
Professional multi-station networks require GL to record all transactions (sales, purchases, cash movements, accruals, capital). Currently only AR/AP subledgers exist; no GL master accounts, no journal entries UI, no GL trial balance, no ability to book manual adjustments (accruals, depreciation, intercompany). CRITICAL for: external audit, financial statements (P&L/balance sheet), tax reporting, bank reconciliation, monthly closing.

**13. Income Statement (P&L) & Balance Sheet Reports** 🇲🇳
Existing reports (daily, sales, margin) are operational dashboards, NOT financial statements. Missing formal P&L (Revenue - COGS - OpEx = Net Income) and balance sheet (Assets/Liabilities/Equity). Required for: monthly/annual financial reporting, loan applications, tax filings (General Department of Taxation), management decision-making. Currently no way to see cumulative profitability or financial position.

**14. Bank Reconciliation (Bank rec)**
No bank reconciliation module. Cannot match bank statements to recorded payments (transfers, card deposits). Essential for: detecting fraudulent transactions, cash embezzlement detection, cash flow tracking. Multi-station networks MUST reconcile daily deposits with bank to verify cashier integrity. Currently only shift cash count (CashReconciliation) exists — no bank-side matching.

**15. Cash Management: Cash Drop / Safe / CIT (Cash-in-Transit)**
No cash drop workflow. When shift cash exceeds safe limit, cashier/manager must record transfer to safe/vault, then CIT pickup to bank. Missing: drop form (date/time/amount/witness), safe inventory (running balance), CIT manifests, reconciliation to actual bank deposit. Leads to cash loss/theft risks and regulatory audit issues. Multi-station networks cannot operate without this.

**16. End-of-Day (EOD) & Daily Closing Procedures**
No formal EOD workflow. Shift close exists but no centralized daily close at company level (all stations' shifts must be closed, cash/nozzle readings reconciled, journal entries posted, trial balance run). Required for: audit trail of daily close, preventing same-day re-entry of closed transactions, month-end cutoff control. Current system allows late entries even after day closes.

**17. E-Receipt (И-баримт / POSAPI Integration)** 🇲🇳
Mongolia mandates e-receipt submission to GDS (General Department of Statistics) via official posapi. Currently fields exist (ebarimtId, ebarimtQr) but NO integration — marked as 'deliberately unimplemented' awaiting official spec. CRITICAL: without e-receipt, system cannot be deployed legally in Mongolia. VAT claims, tax deductions, and sales are not officially recorded.

**18. Invoice Generation & Document Storage** 🇲🇳
Mongolian tax law requires monthly invoices for corporate customers (>1M MNT/mo). Currently no invoice table/template. И-баримт placeholder exists but depends on external API.

**19. Compliance / Tax Withholding & KYC** 🇲🇳
Mongolian tax law (General Customs Law, VAT rules): withholding tax on payments >5M MNT, KYC tier for corporate customers (regNo validation). Schema lacks withholding fields, no tax calculation module.

**20. Executive Dashboard — Multi-station consolidated view (non-existent)**
Professional fuel networks (Shell/BP level) require REAL-TIME executive overview: comparing all stations simultaneously on KPIs (sales, margin %, fill rate, anomalies, shift status). Current `/` dashboard shows only basic stats + station list. No 'big picture' view combining all stations with drill-down capability. Without this, regional/area managers cannot spot underperforming locations instantly.

**21. Competitor price intelligence & market monitoring (missing entirely)** 🇲🇳
Fuel margins are razor-thin (1-3%). In Mongolia, tracking competitor prices (Shell/Aimag/independent stations) is MANDATORY for dynamic pricing strategy. System has no model/UI for: recording competitor prices, API integrations to external price feeds, price comparison alerts, recommendation engine (e.g., 'undercut Shell by 100 MNT' or 'raise prices due to oversupply'). Current pricing is manual only.

**22. Equipment Calibration & Maintenance Tracking** 🇲🇳
Fuel station networks are heavily regulated. Nozzle meters, tank gauges (ATG), scales, and pumps must pass periodic calibration checks by certified metrology labs. No models exist for: calibration due dates, certificates, test results, remediation actions, or automated notifications when calibration expires. This violates most national fuel retail regulations (Mongolia included).

**23. Safety Incident & Accident Reporting (HSE)** 🇲🇳
Fuel stations require mandatory incident reporting: spillages, equipment failures, near-misses, personal injuries, environmental contamination. System has no: incident models, severity classification, investigation tracking, corrective action workflow, or regulatory submission records. This is a fundamental compliance gap for any licensed fuel retailer.

**24. Environmental & Pollution Compliance** 🇲🇳
Fuel stations must track: fuel loss/shrinkage (detects leaks), groundwater contamination risk, storm water discharge permits. Currently no models for environmental monitoring, pollution event logging, or regulatory permit management. Large discrepancies in fuel inventory are flagged only as financial anomalies, not environmental red flags.

**25. Operational Licenses & Permits with Expiry Management** 🇲🇳
Each station requires: business license, fuel retail license, environmental permit, fire safety certificate, hazmat transport license (if delivery vehicles are tracked). System has no model to track license/permit type, issue date, expiry date, renewing authority, or automated alerts 30/60/90 days before expiry. Stations cannot legally operate with expired permits.

**26. Payment Terminal / POS Hardware Integration** 🇲🇳
No integrations for Ingenico, Verifone, or local Mongolian payment terminals (pinpad comms, settlement, reconciliation). Split-tender payment logic exists (CASH/CARD/FUEL_CARD/MOBILE/TRANSFER/CREDIT) but no terminal API bindings to actually process card payments or pinpad PIN verification. Professional networks require real-time terminal health, transaction routing, and reversal handling.

**27. Forecourt Controller / Pump Integration (Gilbarco/Wayne/Dover)**
No pump/nozzle/meter synchronization protocol (OPOS/OLE for Retail or vendor-specific APIs). System tracks Pump/Nozzle/FuelTank/TankReading models in DB but has zero external device bridging. Real networks need live meter feeds, pump authorization signals, grade/nozzle lockouts, and emergency stop relay control. Offline POS works; offline pump does not—critical vulnerability.

**28. Tank Level Monitoring (ATG / Automatic Tank Gauge Integration)**
TankReading model supports 'atg' source field but no driver/protocol to ingest Veeder-Root, Gilbarco, or equivalent ATG data. Manual cm-reading UI exists but zero automated daily inventory tie-point. Creates audit gap: physical stock vs system stock drift detection is manual (user-entered). Real networks reconcile automatically at shift close.

**29. E-Receipt / Posapi Integration (Mongolian Tax Authority)** 🇲🇳
CLAUDE.md explicitly states 'И-баримт хэрэгжээгүй' (deliberately unimplemented). Schema has ebarimtId/ebarimtQr placeholder fields but zero endpoint to send receipt to GS1 Mongolia / State Tax Office posapi (`/posapi/`). All sales bypass tax authority reporting. Mongolian law requires e-receipt filing for VATable transactions. Compliance risk.


## 🟠 HIGH (52)

**30. Price pole / digital sign integration** 🇲🇳
FuelPrice model tracks historical prices but no API to push price changes to forecourt displays (price poles/fuel pump screen signs). International standard: price update → all pumps display new price within 30 sec. Missing: device protocol (Ethernet/serial), batch pricing endpoint, sign status verification.

**31. Pump-tank-nozzle assignment validation & UI**
Schema allows pump/nozzle/tank to be independently created; no validation that nozzle→pump→tank path is logically sound (e.g., pump unassigned, nozzle meter not zeroed). UI has no forecourt diagram/map showing pump layout, which station managers need to physically verify pump IDs during shift open. Missing: visual pump schematic, assignment audit trail.

**32. Blending/multi-grade transactions**
POS sale mixes only one fuel grade per line (saleLineId→fuelGradeId:1). Blending (mix AI-92 + AI-95 in single tank or preset) not supported. Some markets require reporting by blend composition. Schema supports it but logic doesn't; no blend formula tracking.

**33. LPG/CNG alternative fuel support** 🇲🇳
FuelGradeCode hardcoded to AI_80/92/95/DIESEL. LPG (автогаз) is 15–40% of sales in Russia/Mongolia. Missing: separate tank type (pressure vessel ≠ atmospheric), dispenser protocol (different control), pricing/margin tracking, regulatory reporting (LPG requires separate license in many countries).

**34. Meter accuracy certification & calibration tracking** 🇲🇳
Nozzle.meterReading is captured but never validated against certified accuracy (±0.3% legal in EU/US). Missing: calibration schedule (annual/6-month), certificate storage, seal audit trail, drift alerts. Compliance violation if meters not certified—regulators audit gas stations.

**35. Inventory reconciliation via receipts vs. nozzle meters**
Fuel recon report exists (`GET /inventory/reports/fuel-recon`) but is passive (compare tank level vs system). Missing: active reconciliation workflow—flag if total nozzle meters (sum of per-transaction deltas) ≠ tank delta for a period. This is KEY to detecting pump fraud, theft, evaporation.

**36. Nozzle preset sale (fixed amount/liters) execution**
International POS standard: user taps 'Preset 100 лир' → pump locked to dispense exactly 100L → pump stops → sale closed. Schema lacks: preset amount/liter field, pump command execution, timeout handling (customer walks away). Without this, all sales are 'fill-up' (manual pump stop), defeating split-tender & preset workflow.

**37. No Water Content Monitoring (Fuel Quality)**
Fuel absorbs moisture; ISO 4406 specifies max water content (200 ppm petrol, 100 ppm diesel). Schema has no field for water level or tank humidity. Contaminated fuel passes through POS/reconciliation undetected, causing customer complaints + tank corrosion + filter blockages. Fuel quality data required for compliance + dispute resolution.

**38. No Tank Calibration Certificate / Strapping Chart Integration**
Tank volume ≠ linear: cm-to-liters conversion requires official calibration tables (strapping chart). The ShiftTankReading stores manual `centimeters` measurement but has no calibration reference. Cm → liters conversion (if attempted) is hardcoded or missing entirely. Audit trail cannot verify measurement accuracy without calibration date + authority.

**39. Ullage Recording Missing (Receipt Acceptance)** 🇲🇳
When truck delivers fuel, standard procedure: measure ullage (empty space) in receiving tank BEFORE + AFTER, confirm delivered volume. FuelDelivery only records liters accepted; no pre/post ullage measurements or BOL reconciliation. Cannot detect short-loading or theft during receipt. Industry standard: ullage mandatory for disputed deliveries.

**40. No Nozzle Meter Variance Detection (Pump Calibration)**
Nozzle meter (`meterReading` accumulated) can drift 0.5–2% over time. System records opening/closing meter at shift boundaries (ShiftMeterReading) but NO alert/audit if variance exceeds tolerance bands. Provides no mechanism to flag undermetering (revenue loss) or overmetering (customer overcharge). Requires periodic calibration tracking.

**41. Wet Stock Reconciliation Incomplete (No 3-way Balance)**
Proper wet stock reconciliation compares: (Book) Delivery − Dispensed + Adjustment − Evaporation − Water − Shrinkage = (Physical) Tank Volume. Current `fuelReconciliation()` only does: Delivered − Dispensed + Returned + Adjusted = NetChange vs. CurrentLiters. Ignores evaporation, water, shrinkage quantification. Variance alerts present but root-cause attribution is guesswork.

**42. No Bulk Meter (Main Line) Tracking**
Enterprise installations have a main bulk meter (cumulative fuel in/out for entire station). System only tracks individual nozzle meters + tank levels but NO bulk meter endpoint. Cannot cross-verify: (Nozzle 1 + Nozzle 2 + … + Tank change) vs. Bulk Meter — essential for theft detection at station scale. Missing for multi-tank/multi-pump audits.

**43. No Bill of Lading (BOL) / Delivery Proof Document Management** 🇲🇳
FuelDelivery stores optional `documentNo` but no structured BOL capture (supplier signature, truck details, gross/net weight, temperature, seals, tank ID). Cannot audit delivery authenticity or dispute resolution. Monolian fuel law (TSG 3515.12) requires documented delivery acceptance.

**44. Single ATG Source Only (No Multi-Probe Averaging)**
TankReading.source is 'manual' or 'atg' (single string) but large tanks use 3+ probes + averaging for accuracy. Schema provides no multi-probe averaging, probe ID tracking, or probe health alerts. Assumes single point-sensor trust — unreliable for 5000+ L tanks.

**45. Performance KPIs & Incentives**
POS борлуулалт бол кассчингийн гүйцэтгэл. Finance endpoints-д KPI байгаа (`/finance/kpi`), гэхдээ энэ нь компаний-түвшний борлуулалт/ахиц. Ажилтан-түвшний гүйцэтгэл (энэ ээлжийн борлуулалт сум, орлого нь хэдэн ℥, хойш гүйлгээ хэдэн %), болон кассчингийн үзүүлэлтээ tracker, bonus pool бүлэг ажилтны (lunch shift, evening shift) замыг шийдвэрлэхэд байхгүй. Комиссийн ихэнх буюу стандартын эргүүлэлтийн борлуулалтын үнэ өөрчлөгдвөл уг гүйцэтгэл огцом өөрчлөгдөнө.

**46. Employee Certifications / Training Records**
Шатахуун станцын кассчин, менежер эргүүлэлтийн ажилтнуудад safety certification, hazmat handling, POS training гэх мэт сургалт туршлагаас архивлах явах. Туршлагын өдрөөр гэрчилгээ сэргээхэд алармайхан логик байхгүй. Employee модельд байрлуулж болохгүй, Certification model-ий хэрэгтэй. Тансаг бүрд (ж: Gas Attendant L1, L2, POS Cashier Level A) holder tracking.

**47. Leave Management (Annual/Sick/Casual)**
Attendance clock-in/out байгаа л. Чөлөө (yearly leave, medical leave, casual leave) энакбүдэл үгүй. Компанийн хойноо Attendance.clockOut=NULL гэж үгүй болох хүн энэ өдсөөр чөлөөтэй гэж үзэх аян. Leave request workflow, manager approval, balance tracking (salaryngийн дүн дээр нөлөөлж болно) байхгүй.

**48. Employee Appraisal / Performance Review**
Staff хяналтын самбар байгаа, гэхдээ энэ нь ээлжийн төлөв (PENDING_OPEN/OPEN/PENDING_CLOSE/CLOSED) болон орлого (today borrows) л. Ажилтны сүүлчийн 3–6 сарын гүйцэтгэл (rating, feedback, goals set), manager-ийн сэтгэгдэл, promotion/demote log байхгүй. Шатахуун станцын ажилтны tenure growth, career path (cashier → shift lead → station manager → area manager) tracker байхгүй.

**49. Expense / Allowance Management**
Ээлжийн ажилтан бэлэн мөнгөний илүүдэл/дутагдал (CashReconciliation) хариуцлага байгаа, гэхдээ travel allowance, meal allowance, mobile allowance гэх мэт урамшуулалын жагсаалт байхгүй. Цалина эдгээрийг нэмэх ёстой. Мөнгөний цувралд хүнтэй холбоотой зардал отчет хүлээн авах логик байхгүй.

**50. Cashier Variance / Accountability Log**
CashReconciliation байгаа (expectedCashMnt vs countedCashMnt), гэхдээ кассчин шинэсүүдийг гүйлгээ бүрд шалга бүлүүлэх логик байхгүй. Жишээ: Shift-ийн хаалтад $500 дутадал дүнсэн → иргүүдийг tracking, төлөөлөл, ажилтана хариуцлага (write-off/deduct from salary/suspend) механизм байхгүй. Ээлжийн хүүхэлүүдийн variance по дүүн агор карт (performance drill-down) бүтээх, кассчин тус бүрд дүүн бүр хариуцлагыг илүүлэх шаарддаг.

**51. Accounts Payable Aging & Payment Planning**
Basic AP ledger (subledger) exists but no aging buckets (0-30 / 31-60 / 61-90 / 90+ days overdue). No payment plan forecasting, no early payment discount tracking, no supplier credit terms management (net 30, net 60). Professional networks use this for cash flow planning and supplier relationship management.

**52. Accounts Receivable Aging & Collection Management**
Basic AR subledger exists but no aging analysis, no collection workflow (overdue notices, hold credit), no credit limit enforcement (system allows sale beyond limit), no bad-debt reserve estimation. Multi-location networks need AR aging for credit decisions and collection priority.

**53. Multi-Currency Support & Exchange Rate Management**
System hardcoded to MNT only. No currency field, no exchange rate tables, no foreign currency transaction handling. For networks importing fuel or equipment in USD/RUB/CNY or operating cross-border, critical gap. Blocks expansion to import operations.

**54. Accruals & Deferrals (Prepaid/Accrued Expenses)**
No accrual module. Cannot record: rent prepaid, insurance accrued (12 months →monthly), utility bills accrued, maintenance contracts deferred, monthly salary accruals. All multi-location businesses use accruals for period-accurate P&L. Current system will overstate monthly profit if expenses arrive in bulk.

**55. Fuel Price Variance Analysis & Hedging Tracking**
Margin report shows cost basis (weighted avg) vs sale price, but no formal variance tracking: purchase price changes vs standard cost, quantity variance, efficiency loss (evaporation/theft). Professional fuel networks track these separately for accountability. No hedging exposure tracking if company trades futures or swaps.

**56. Tax Filing Module & Compliance Reporting** 🇲🇳
Only VAT report (output 10%) exists. Missing: Income tax calculation (employer withholding, corporate tax), social insurance deduction verification, monthly/quarterly tax return forms, tax audit trail. Mongolia requires monthly tax filing; system cannot auto-generate required forms (tax period summary, payroll tax report).

**57. Loyalty Program / Customer Points System** 🇲🇳
Multi-brand fuel networks globally use loyalty programs for customer retention. Mongolian market expected to adopt (Shell, BP, Total). Points accumulation, redemption, tier-based benefits missing.

**58. Corporate Fleet / Fuel Card Management**
Essential for B2B revenue (40-60% in mature networks). Missing: vehicle/driver registration, card PIN management, per-vehicle consumption limits, trip reconciliation, driver behavior tracking, odometer readings.

**59. Promotion Engine / Dynamic Pricing**
Competitive differentiation in fuel retail. Cannot run: time-based promos (3-5pm discounts), volume-based rebates, targeted discounts by customer segment, promotional campaigns with coupons/vouchers.

**60. Customer Notifications / Engagement (SMS/Push/Email)** 🇲🇳
Retention mechanism. Missing: payment reminders for credit customers, balance low alerts, promotion push, delivery status updates, compliance alerts (TIN verification).

**61. Company-Level KPI Dashboard**
Multi-station network needs consolidated cross-location metrics: network margin %, fuel shrinkage %, customer acquisition cost, station profitability ranking, competition benchmarking.

**62. Payment Gateway Integration (Xac Pay, Khan Bank, Capitec)** 🇲🇳
Only CASH/CARD/TRANSFER/MOBILE recorded. Missing: active integration with Mongolian payment processors for online reconciliation, POS terminal batch settlement, auto-reconciliation, chargeback handling.

**63. ATG (Automatic Tank Gauge) Integration**
Schema has `TankReading.source = 'manual|atg'` but webhook/API consumption missing. Manual readings => reconciliation delays (fuel shrinkage detection 24h later).

**64. Customer Credit Limit Auto-Enforce**
Schema has `creditLimitMnt` field but no validation logic during credit sale. POS allows sale even if AR+new sale > limit. Needs: hard-block, warnings, AR aging, auto-suspension at 90+ days overdue.

**65. Geographic visualization & location-based analytics (data stored, UI absent)** 🇲🇳
Station model has `latitude/longitude` fields (unused). Professional networks visualize stations on maps: color-coded by performance (red=low margin, green=strong), show nearby competitor locations, analyze geographic clustering. Zero map UI exists. For multi-location strategies (esp. Ulaanbaatar vs aimag), this is essential.

**66. Fuel demand forecasting & inventory optimization (missing)** 🇲🇳
Current system logs historical sales but provides NO demand forecast. Large networks need: 1) time-series analysis (sales trends by day-of-week, season, weather), 2) forecast next week's demand per fuel grade per station, 3) auto-alerts when predicted demand > tank capacity. Prevents stockouts during peaks and excess holding costs during downturns.

**67. Weather impact analysis (no integration)** 🇲🇳
Fuel sales correlate strongly with weather (cold = higher diesel demand, rain/snow = reduced traffic). System has NO weather data ingestion, no correlation analysis, no ability to predict 'Thursday snow = +15% diesel sales expected'. Essential for dynamic inventory planning in Mongolian climate with extreme seasonal swings.

**68. Station performance benchmarking & peer comparison (missing)**
No KPI-based station ranking/comparison. A 5-station network should have: 'Station C is 22% below avg margin' or 'Station A leads in AI-92 turnover'. Current finance page shows daily KPI table by station but NO benchmarks, NO trend lines, NO percentile ranking. Critical for regional allocation decisions.

**69. Real-time alerts & anomaly thresholds (partially built, not configurable)**
System detects 2 anomaly types (cash variance, large refunds) but: 1) thresholds are HARDCODED (not configurable per station/company), 2) no SME workflow to investigate/resolve, 3) no scheduled digest/escalation (e.g., daily email), 4) no alert for fuel recon gaps >5%, no low-stock alerts per grade, no margin-drop alerts.

**70. Historical trend analysis & OKR dashboard (missing)**
No time-series charts. Reports show point-in-time snapshots (daily/monthly) but NO: sales trend (7-day, 30-day, YTD), margin erosion tracking, customer count trends, turnover velocity by fuel grade. Professionals need to spot patterns (e.g., 'AI-92 sales declining 3% weekly for 2 months').

**71. Fraud Detection: Drive-off, No-sale, Nozzle Tampering**
Professional networks implement anti-fraud monitoring: drive-offs (customer leaves without paying), no-sale transactions (pump dispensed but no POS record), nozzle meter reset tampering, excessive void/refund patterns. System catches cash reconciliation variance and large refunds as anomalies, but has NO: vehicle tracking, drive-off lockout, pump-to-POS reconciliation, or pattern-based fraud scoring.

**72. Detailed Fuel Loss/Shrinkage Analysis**
The fuel reconciliation report (`/inventory/reports/fuel-recon`) compares: nozzle meter total (delivery - sales) vs tank gauge reading. If discrepancy > threshold, it alerts. But lacks: root cause categorization (evaporation, measurement error, actual loss/theft), temperature-corrected volume calculations, trend analysis over time, or corrective workflow. Cannot distinguish between systematic error and real losses.

**73. RBAC for Regulatory Compliance & Segregation of Duties**
Current RBAC (CASHIER, SHIFT_SUPERVISOR, STATION_MANAGER, ACCOUNTANT, OWNER, ADMIN) covers operations but lacks compliance-specific roles: Chief Compliance Officer, Internal Auditor, Regulatory Reporting Officer, HSE Manager. No granular permission matrix for: who can approve refunds >X amount, who can access confidential reports, who can authorize equipment maintenance, etc. Separation of duties is implicit, not enforced.

**74. Driver & Delivery Vehicle Management** 🇲🇳
Fuel networks track delivery: supplier ID, fuel grade, quantity, dates. But missing: driver identity, vehicle registration, license plate, vehicle inspection/MOT records, delivery route verification, driver conduct incidents. No traceability of who delivered fuel, which vehicle, or verification of driver qualifications (dangerous goods certification, etc.).

**75. Station Inventory Discrepancy Investigation Workflow**
When fuel reconciliation fails (meter vs tank mismatch), the system detects it but provides no: formal investigation case management, root-cause hypothesis tracking, remediation action assignments, verification/closure workflow, or audit trail of investigation outcome. Discrepancies are logged as audit events but not actioned systematically.

**76. Device Health Monitoring & Alerting Dashboard**
No pump/terminal/ATG health status, uptime metrics, or alarm center. Pump offline, meter malfunction, terminal network down—admin gets no proactive alert. No heartbeat model, no SLA tracking, no escalation workflow. Finance dashboard shows KPI but not device fleet health. Professional networks need separate 'Ops Dashboard' (pump status by station, terminal availability, last sync time).

**77. Shift Closure with Device Handoff & Loss Reconciliation**
Shift close flow (PENDING_CLOSE → cash reconciliation) works but does NOT reconcile meter readings against tank readings or inventory. System accepts ShiftMeterReading (nozzle meter at open/close) and ShiftTankReading (tank cm at open/close) but the variance calculation (expected vs counted pump liters) is manual/audit after-the-fact, not automated. Professional networks enforce: Meter variance → alert supervisor before close approval.

**78. Maintenance & Service Request Workflow**
Zero maintenance module: no work orders, no vendor assignment, no pump downtime logging, no spare-parts inventory. When pump breaks, system has no way to mark it offline (auto-disable in POS) or log who serviced it. Compliance blind spot—no maintenance audit trail for regulatory inspection. Professional networks track: pump maintenance schedule, downtime duration, service vendor, parts replaced.

**79. Multi-Station Inventory Forecasting & Replenishment Automation** 🇲🇳
StockLevel.reorderLevel exists but zero demand forecasting, no automated PO generation, no safety-stock logic. Procurement is fully manual: create Purchase → assign to suppliers → manuallywait for receipt. Real networks need: Forecast by grade (AI-92 demand Tue–Thu higher), auto-trigger PO at threshold, supplier-grade assignment, ETAssess days (account for tanker route time, road condition in MN winter). Prevents stockouts/excess inventory.

**80. Offline Mode Resilience for Forecourt Operations** 🇲🇳
IndexedDB sync exists for POS but pump authorization (nozzle enable/disable) ONLY works online. If API is down, pump cannot be remotely locked/unlocked. Network loss on busy Saturday morning = unable to stop unauthorized sales or isolate faulty nozzle. System assumes continuous connectivity for safety-critical pump control—unrealistic in remote Mongolia or during ISP outages.

**81. Accounting / GL Integration & Export** 🇲🇳
Finance module outputs toughly (daily, consolidated, margin, VAT reports) but zero integration with accounting software (1C, QuickBooks, SAP, MongoDB). No GL chart-of-accounts mapping, no journal entry export, no bank reconciliation feed. Accountant must manually re-enter summary to external ledger—error-prone and audit-unfriendly. Professional networks export: Sales GL account, VAT payable, AR aging, AP aging to third-party GL.


## 🟡 MEDIUM (30)

**82. No Pump Throughput Ratio / Consistency Check**
Multiple nozzles on same pump should dispense proportionally (if both open). System tracks nozzles independently but provides NO ratio analysis or anomaly detection. A failed nozzle meter (stuck/broken) goes unnoticed for days because individual variance is acceptable—but ratio to siblings would flag it immediately.

**83. No Forecasting / Reorder Automation Based on Consumption Trending**
StockLevel has `reorderLevel` (static) but zero forecast model. For fuel (perishable, volatile price), ERP should auto-predict consumption for next 7/14/30 days + suggest reorder qty/timing. Current system requires manual 'low stock alert' review. No peak/off-peak demand curve or seasonal adjustment.

**84. No Supplier Quality Rating / Delivery Variance Log**
SupplierTransaction tracks payment/receipt but no quality metrics: % short-deliveries, late arrivals, fuel temp at delivery, repeat variance patterns. Cannot identify underperforming suppliers or negotiate SLA compliance. Essential for multi-supplier networks to auto-rank reliability.

**85. Margin Report Lacks Grade-Specific Cost Tracking** 🇲🇳
The `/finance/margin` endpoint exists but logic is unclear. FuelPrice + PurchaseLine.unitCostMnt are tracked, but if same grade has multiple suppliers at different prices, FIFO cost allocation is NOT implemented. Margin report will be inaccurate under high-volatility fuel markets (common in Mongolia). Requires weighted-average or FIFO history per tank.

**86. No Retail/Wholesale Price Tier Management**
FuelPrice is single pricePerLiterMnt per station/grade. No support for: bulk discounts, loyalty discounts, time-of-day pricing, contract rates (corporate fleets), or fuel card issuer-specific rates. Common in fuel retail networks—currently would require manual POS adjustments or custom development.

**87. Fuel Card Integration Not Implemented (Payment Method Only)** 🇲🇳
PaymentMethod.FUEL_CARD exists but no integration: no card balance validation, merchant PIN reconciliation, fuel card issuer settlement, or dispute tracking. Accepted as generic payment but cannot prevent over-limit sales or track card-to-delivery traceability.

**88. No Tank Health / Maintenance Schedule Tracking** 🇲🇳
FuelTank has no fields for: last inspection date, corrosion assessment, leak test results, maintenance history, next service due. Critical for safety + longevity; rupture/contamination incidents trace back to deferred maintenance. Required for insurance + regulatory compliance (Mongolia Energy Ministry).

**89. No Blending / Additives Tracking**
Some stations blend different fuel grades or add detergents. Schema assumes pure grades. No support for: blend ratios, additive inventory, batch traceability, or addititive cost allocation to blended fuel. Manifests as reconciliation variance if blended fuel dispensed from 'wrong' tank code.

**90. Shift Tank Readings Lack Sequential Anomaly Detection**
ShiftTankReading stores OPEN/CLOSE cm + liters per shift but zero analysis: No alert if tank level INCREASED between close→next open (impossible without delivery), or if drop exceeds evaporation+dispensed. Systematic under-recording (by operator bias) goes undetected for weeks.

**91. No Shrinkage Tolerance Bands / Variance Thresholds**
fuelReconciliation() calculates variance but comparison is to `currentLiters` only. Industry allows 0.5–1.5% shrinkage (evaporation + measurement uncertainty). System should flag variances >threshold as 'investigate' vs. 'acceptable'. All variances currently appear suspicious regardless of magnitude.

**92. No Tank Isolation / Safety Status (Dispensing Lockout)**
FuelTank has `isActive` boolean but no 'QUARANTINE' or 'OUT_OF_SERVICE' status. If water detected or calibration failed, station ops should prevent dispensing from that tank. Currently would require manual deletion (destructive) or soft-delete ignoring (leaves POS accessible). No safety interlock.

**93. Multi-Location Staff Rotation & Management**
EmployeeStation байгаа (ажилтан → хэдэн салбарт хандала эрхтэй), гэхдээ ажилтан нэг салбараас нөгөөд шилжүүлэх (transfer), түр цүүлэлт (temporary posting), эргүүлэлтийн хуваарь эмпирик. Олон салбартай компанийн хүн эргүүлэлтийн логик (rotation schedule, cost allocation, fare reimbursement) байхгүй.

**94. Employee Handbook / Compliance Documentation** 🇲🇳
Салбарын нэмэлт асуудал: duty list, SOP (standard operating procedure) ажилтна нэг/бүлэг эргүүлэлтийн дээр, harassment policy, disciplinary action records байхгүй. Монголын хуульд ажлын тойм, эргүүлэлтийн нөхцөл, шаргалт арга байдаг. Хүнтэй холбоотой сар болгонд нотлох эмпирик.

**95. Unemployment Insurance (EI) Tracking** 🇲🇳
Монголын хуульд нас барсан тохиолдолд UE insurance (НДШ)-ийн хуваалт сүүд. Ажилтан бүрт түүхээ хадгалах (hire date, employment status, termination reason, final settlement) байхаас зайлшгүй. Гэхдээ Employee-д hiredAt байгаа л, ажилтны чөлөөлөлтийг (resignation, dismissal, retirement, contract end) tracking, appeal-ийн нотлох үүнийхээ байхгүй.

**96. Debt Aging Report & Bad-Debt Provisioning**
No provisioning for doubtful debts. No automatic bad-debt reserve calculation (% of aging buckets). Required for: IFRS compliance (if company reports IFRS), bank loan covenant reporting, annual audit. Currently can see customer ledger but no provisioning logic.

**97. Petty Cash Management & Reimbursement Tracking**
No petty cash module. Cannot track small expenses (office supplies, minor repairs, meals for business) that may not have receipts. Common in fuel networks for station-level discretionary spending. Missing: advance tracking, reimbursement approval workflow.

**98. Fixed Asset Register & Depreciation Tracking**
No asset module (pumps, tanks, canopy, CCTV, POS terminals). Cannot track acquisition cost, depreciation method, accumulated depreciation, asset disposal. Required for: monthly P&L (depreciation expense), balance sheet (net asset value), annual tax return (depreciation deduction), capital budgeting.

**99. Cost Center & Profit Center Reporting**
No cost/profit center allocation. All costs go to station level. No way to report: cost by expense category (wages/rent/utilities), profit by product line (fuel vs shop vs services), segment profitability. Limits management visibility into which products/stations are profitable.

**100. Batch Import / Reconciliation Tools**
Large networks need bulk operations: bulk customer upload (CSV), bank statement import & auto-matching, multi-station price synchronization, bulk delivery receipt.

**101. Supplier Contract & Price Agreement Management**
Missing: price lock agreements (e.g., AI-92 @ 1,500 MNT until Dec 2025), volume discount tiers, payment terms (Net-30), rebate tracking, breach alerts when actual price differs.

**102. Seasonal/day-type adjustment factors & sales modeling (missing)** 🇲🇳
No distinction between: weekday vs weekend, holiday vs normal, summer vs winter patterns. Current reports aggregate all days equally. Professional networks apply seasonal indices to forecast & adjust targets. E.g., 'Q2 typically 18% higher, Fridays +22%, New Year +30%'.

**103. Crew/shift performance analytics (non-existent)**
System tracks shift opening/closing but NO: cashier KPIs (avg transaction size, refund rate, cash variance trend), peer comparison ('Saraa's avg ticket is 8% above team'), shift quality scoring, or productivity metrics. For staff accountability and training, this is standard.

**104. Fuel quality & loss tracking (system records movements but no analysis)** 🇲🇳
StockMovement tracks LOSS type but provides NO: evaporation analysis (expected vs actual), leakage patterns, grade-level loss reporting, or automated reorder point optimization. In hot climates, fuel loss is 2-3% annually — no visibility into it.

**105. Customer segmentation & lifetime value (minimal)** 🇲🇳
Customer model exists but system provides NO segmentation (B2B fleet vs retail, account age, spend tier), NO LTV calculation, NO churn prediction, NO targeted promotions. Large stations (esp. Ulaanbaatar) have high-value fleet accounts needing dedicated analytics.

**106. Customer Compliance: Credit Limits & Arrears Management**
System enforces credit limits on credit sales. Missing: automated suspension when customer exceeds limit (hard block), arrears escalation workflow (alert → phone call → payment plan → legal action), bad-debt provisioning, credit scoring/rating changes, or integration with credit bureau reporting.

**107. Regulatory Reporting & Export for Government Agencies** 🇲🇳
Fuel retail is subject to government audits. System lacks: standardized export formats for tax authorities (НӦАТ), fuel regulator (if applicable), environmental agency reports. No models for: regulatory submission history, approval status, amendment tracking, or compliance certification.

**108. Employee Drug/Alcohol Testing & Background Checks**
Many fuel networks require: pre-employment background checks, periodic drug testing for drivers/cashiers, training certification (fuel handling, emergency response). System has basic employee records (name, status, phone) but no: test result tracking, certification expiry, training logs, or incident flagging tied to employee.

**109. Multi-Currency Support (Contingency for Tour/Expat Customers)** 🇲🇳
All prices hardcoded to MNT (BigInt). Schema has no currency field on FuelPrice/Sale/Payment. If operator serves tour groups or expats, no USD/CNY on-the-fly conversion. Real networks in tourist hubs support local + foreign currency with daily rate refresh. MVP may not need it, but adds friction for growing station chains.

**110. Fuel Blend / Grade-Mixing Tracking**
System assumes 1 tank = 1 grade (AI-80/92/95/DIESEL) with no blending logic. If station physically mixes grades (e.g., 40% AI-80 + 60% AI-92 into shared tank), inventory and cost-per-liter become inaccurate. Modern compliance & QA tracks blend ratio, temperature-adjusted volume, and additive batches. Mitigatable if stations use segregated tanks, but complicates operations.

**111. Role: Service Technician / Mechanic (Pump Service, Nozzle Maintenance)**
RBAC has 6 roles: CASHIER, SHIFT_SUPERVISOR, STATION_MANAGER, ACCOUNTANT, ADMIN, OWNER. Missing: SERVICE_TECH (can log nozzle jam, meter calibration, pump downtime). Current design ties maintenance to audit log only; no dedicated role for on-site technician workflow. Small chains may not need it, but scales poorly at 10+ stations.


## ⚪ LOW (3)

**112. Procurement Missing Pre-Payment / Advance Purchase Orders**
Purchase→PurchaseLine flow assumes goods-first receipt. No support for: advance POs (quote phase), deposit tracking, partial shipments with backorder status, or price-lock futures. Fuel suppliers sometimes require prepayment; current schema cannot represent this purchase state.

**113. No Delivery Route Optimization / GIS Integration**
Multi-station networks benefit from delivery route planning (reduce fuel cost). Station has lat/long but zero route optimization, distance calculation, or delivery sequence hints. Manually managed externally; integration would improve logistics efficiency.

**114. Union / Employee Negotiation Records** 🇲🇳
Зарим дөрвөлжин газруудад ажилтны нэгдэл/эрхүүд байдаг. Системийн 2-10 салбартай цэлсэн сүлжээ гэвэл шуурхай байхүүлэх хэрэгүүдийн энэ modular байхгүй шүүмжлэл. Гэхдээ шатахуун станцын үлэмжтэй сүлжээнд (50+ ажилтан) нэгдэл мөхлөг/цалингийн гэрээ, эргүүлэлтийн нөхцөл tracking байж болох юм.

