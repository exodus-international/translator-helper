# [1.3.0](https://github.com/exodus-international/translator-helper/compare/v1.2.0...v1.3.0) (2026-09-02)


### Bug Fixes

* **audio:** HTML handling — pause-duration markers, data-read skip, heading pauses ([#122](https://github.com/exodus-international/translator-helper/issues/122)) ([1fb18a6](https://github.com/exodus-international/translator-helper/commit/1fb18a6b9abe194074d1b1f09ef3409edd6852bf))
* **audio:** strip invisible characters before reading the script ([#133](https://github.com/exodus-international/translator-helper/issues/133)) ([06446a2](https://github.com/exodus-international/translator-helper/commit/06446a267946b55adc81050fd3cc24e9f06433ea))
* **documents:** give each project group a key in the overview table ([#129](https://github.com/exodus-international/translator-helper/issues/129)) ([23d7b54](https://github.com/exodus-international/translator-helper/commit/23d7b5494068fd3cccb9600daad15e1c452a14e8))
* extract release notes for minor and major releases ([#106](https://github.com/exodus-international/translator-helper/issues/106)) ([c4db1df](https://github.com/exodus-international/translator-helper/commit/c4db1dfefc3a42242ea486ebc6cc0e8c3b7fa804))
* inline project creation on the upload page ([#140](https://github.com/exodus-international/translator-helper/issues/140)) ([#141](https://github.com/exodus-international/translator-helper/issues/141)) ([3124e98](https://github.com/exodus-international/translator-helper/commit/3124e98695edf8ed70cd4ad63aedbbe184a08f19)), closes [#136](https://github.com/exodus-international/translator-helper/issues/136)
* **sidebar:** long file paths no longer widen the sidebar ([#121](https://github.com/exodus-international/translator-helper/issues/121)) ([7c6e7c0](https://github.com/exodus-international/translator-helper/commit/7c6e7c0e1a57ed2bd52a15317149bacf1fe3c4e7))


### Features

* **audio:** generate audio on approval and play it on the review page ([#118](https://github.com/exodus-international/translator-helper/issues/118)) ([3b5a371](https://github.com/exodus-international/translator-helper/commit/3b5a371e8793f7d089936ca1627a3d242d833e54)), closes [#109](https://github.com/exodus-international/translator-helper/issues/109) [#108](https://github.com/exodus-international/translator-helper/issues/108) [#111](https://github.com/exodus-international/translator-helper/issues/111)
* **audio:** markdown to speech script and SSML builder ([#117](https://github.com/exodus-international/translator-helper/issues/117)) ([e7e8c8d](https://github.com/exodus-international/translator-helper/commit/e7e8c8d2500ccf8b90684e7cc0d77fb975064eba)), closes [#110](https://github.com/exodus-international/translator-helper/issues/110)
* **audio:** readable download filenames and sidebar status ([#120](https://github.com/exodus-international/translator-helper/issues/120)) ([db6373b](https://github.com/exodus-international/translator-helper/commit/db6373be1da8513fbd66de4956f4cc26d61ce655))
* **audio:** regenerate, admin settings, sweep, deploy integration, analytics ([#119](https://github.com/exodus-international/translator-helper/issues/119)) ([f6903ad](https://github.com/exodus-international/translator-helper/commit/f6903ad3dd7fc7adae8807676dff505f016f9c97)), closes [#112](https://github.com/exodus-international/translator-helper/issues/112) [#108](https://github.com/exodus-international/translator-helper/issues/108) [#113](https://github.com/exodus-international/translator-helper/issues/113) [#114](https://github.com/exodus-international/translator-helper/issues/114) [#115](https://github.com/exodus-international/translator-helper/issues/115) [#116](https://github.com/exodus-international/translator-helper/issues/116) [#113](https://github.com/exodus-international/translator-helper/issues/113) [#114](https://github.com/exodus-international/translator-helper/issues/114) [#115](https://github.com/exodus-international/translator-helper/issues/115) [#116](https://github.com/exodus-international/translator-helper/issues/116)
* auto-name uploaded day documents ([#146](https://github.com/exodus-international/translator-helper/issues/146)) ([fffefdd](https://github.com/exodus-international/translator-helper/commit/fffefdd752e76d3f8fe640f92b5ffca9ec567cae)), closes [#123](https://github.com/exodus-international/translator-helper/issues/123) [#142](https://github.com/exodus-international/translator-helper/issues/142) [#143](https://github.com/exodus-international/translator-helper/issues/143)
* **documents:** content type badges and kanban type filter ([#128](https://github.com/exodus-international/translator-helper/issues/128)) ([af480fb](https://github.com/exodus-international/translator-helper/commit/af480fb495cd1690374e4d1ed545fc4a8d95f3b3)), closes [#126](https://github.com/exodus-international/translator-helper/issues/126)
* readable document URLs ([#136](https://github.com/exodus-international/translator-helper/issues/136)) ([b304cca](https://github.com/exodus-international/translator-helper/commit/b304cca043feed70c62a79f0205c0d875232a2b4))
* readable project URLs ([#138](https://github.com/exodus-international/translator-helper/issues/138)) ([43cfda5](https://github.com/exodus-international/translator-helper/commit/43cfda562c07b0805c314eb1227b3f6b5a280337))
* real icon set and link preview card ([#135](https://github.com/exodus-international/translator-helper/issues/135)) ([d392bb7](https://github.com/exodus-international/translator-helper/commit/d392bb73658626836f876f2e3dee7e92085945f0))
* show the logo in the navbar and on the auth screens ([#139](https://github.com/exodus-international/translator-helper/issues/139)) ([ac93860](https://github.com/exodus-international/translator-helper/commit/ac938607444ab3e8cc6175de6f8c87a647be4e1c))


### Performance Improvements

* **documents:** stop shipping every translation to the overview ([#131](https://github.com/exodus-international/translator-helper/issues/131)) ([ebfd060](https://github.com/exodus-international/translator-helper/commit/ebfd0601c5c2b032f51dc4f092dfb838d79e83de))
# [1.2.0](https://github.com/exodus-international/translator-helper/compare/v1.1.2...v1.2.0) (2026-08-04)


### Bug Fixes

* crash when saving user languages in the admin users table ([#102](https://github.com/exodus-international/translator-helper/issues/102)) ([9e2fa69](https://github.com/exodus-international/translator-helper/commit/9e2fa69221c46bf3c40c18c4363c058ff6d1eb6a))
* open projects in the user's assigned language ([#101](https://github.com/exodus-international/translator-helper/issues/101)) ([7a89b7e](https://github.com/exodus-international/translator-helper/commit/7a89b7e0a4a8144439d3f94fd4af81332e44f355))


### Features

* admin users data table with activity columns ([#90](https://github.com/exodus-international/translator-helper/issues/90)) ([ebcfb61](https://github.com/exodus-international/translator-helper/commit/ebcfb616c80f9a51b71cc2c1adaf146e45ec9d46)), closes [#75](https://github.com/exodus-international/translator-helper/issues/75) [#74](https://github.com/exodus-international/translator-helper/issues/74) [#76](https://github.com/exodus-international/translator-helper/issues/76) [#74](https://github.com/exodus-international/translator-helper/issues/74) [#77](https://github.com/exodus-international/translator-helper/issues/77) [#74](https://github.com/exodus-international/translator-helper/issues/74) [#78](https://github.com/exodus-international/translator-helper/issues/78) [#74](https://github.com/exodus-international/translator-helper/issues/74) [#79](https://github.com/exodus-international/translator-helper/issues/79) [#74](https://github.com/exodus-international/translator-helper/issues/74) [#79](https://github.com/exodus-international/translator-helper/issues/79) [#81](https://github.com/exodus-international/translator-helper/issues/81)
* in-app announcements (banner/modal with CTA) ([#99](https://github.com/exodus-international/translator-helper/issues/99)) ([6e9c3f2](https://github.com/exodus-international/translator-helper/commit/6e9c3f286fcace1f5b7f430a027fd52e5a173b5c)), closes [#92](https://github.com/exodus-international/translator-helper/issues/92) [#92](https://github.com/exodus-international/translator-helper/issues/92) [#93](https://github.com/exodus-international/translator-helper/issues/93) [#93](https://github.com/exodus-international/translator-helper/issues/93) [#94](https://github.com/exodus-international/translator-helper/issues/94) [#94](https://github.com/exodus-international/translator-helper/issues/94) [#95](https://github.com/exodus-international/translator-helper/issues/95) [#95](https://github.com/exodus-international/translator-helper/issues/95) [#96](https://github.com/exodus-international/translator-helper/issues/96) [#96](https://github.com/exodus-international/translator-helper/issues/96) [#97](https://github.com/exodus-international/translator-helper/issues/97) [#97](https://github.com/exodus-international/translator-helper/issues/97)
## 1.1.2 (2026-07-20)


### Bug Fixes

* identify/reset PostHog identity on client-side login and logout ([#86](https://github.com/exodus-international/translator-helper/issues/86)) ([6017bdd](https://github.com/exodus-international/translator-helper/commit/6017bdd351d7c477c92c130c934f34eeec33df16))



## 1.1.1 (2026-07-17)


### Bug Fixes

* gate analytics on build-time PostHog key instead of __loaded flag ([#84](https://github.com/exodus-international/translator-helper/issues/84)) ([bd66d8a](https://github.com/exodus-international/translator-helper/commit/bd66d8acf52edcaeabc754624672b3e52d84b644))



## 1.1.0 (2026-07-16)


### Features

* user profile, onboarding, and archiving ([#72](https://github.com/exodus-international/translator-helper/issues/72)) ([0681744](https://github.com/exodus-international/translator-helper/commit/06817448b63c8f4506c0a5094fddfa01565ea709))
* integrate PostHog for enhanced analytics tracking ([#81](https://github.com/exodus-international/translator-helper/issues/81)) ([333daea](https://github.com/exodus-international/translator-helper/commit/333daea0597d1b75efb67843ed2d3f9e65cdd326))


### Bug Fixes

* accept YAML files in document upload ([#80](https://github.com/exodus-international/translator-helper/issues/80)) ([c2445aa](https://github.com/exodus-international/translator-helper/commit/c2445aa2ada6d4c0064209476a459f4f8b1fa7e5))



## 1.0.0 (2026-06-09)

First standardized release ([#67](https://github.com/exodus-international/translator-helper/issues/67)) — baseline for this changelog. Everything before this point (project start through the initial production deploy: editor, suggestions, review workflow, GitHub deploy integration, Sentry, invitations, seeding) shipped as v1.0.0.
