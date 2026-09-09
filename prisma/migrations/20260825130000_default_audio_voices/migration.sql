-- Team policy: always the male voice per locale. Seeds voices on existing
-- languages that have none; the provider stays unset so audio is not switched
-- on until an admin picks the provider in the language form.
UPDATE "language" SET "audioVoice" = 'cs-CZ-AntoninNeural' WHERE "code" = 'cs' AND "audioVoice" IS NULL;
UPDATE "language" SET "audioVoice" = 'sk-SK-LukasNeural'   WHERE "code" = 'sk' AND "audioVoice" IS NULL;
UPDATE "language" SET "audioVoice" = 'pl-PL-MarekNeural'   WHERE "code" = 'pl' AND "audioVoice" IS NULL;
