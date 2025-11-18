"use client";

import { useMemo, useState } from "react";
import { Language } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { updateLanguageInstructionsAction } from "@/domain/language/language.actions";

interface LanguageInstructionsClientProps {
  languages: Language[];
}

export default function LanguageInstructionsClient({
  languages,
}: LanguageInstructionsClientProps) {
  const initialMap = useMemo(
    () =>
      Object.fromEntries(
        languages.map((language) => [
          language.id,
          language.translationInstructions || "",
        ])
      ),
    [languages]
  );

  const [instructionsByLanguage, setInstructionsByLanguage] =
    useState<Record<string, string>>(initialMap);
  const [savingLanguageId, setSavingLanguageId] = useState<string | null>(null);
  const [lastSavedMessage, setLastSavedMessage] = useState<
    Record<string, string>
  >({});

  const handleSave = async (languageId: string) => {
    const value = instructionsByLanguage[languageId] || "";
    setSavingLanguageId(languageId);
    setLastSavedMessage((prev) => ({ ...prev, [languageId]: "" }));

    try {
      const updated = await updateLanguageInstructionsAction(languageId, {
        translationInstructions: value.trim() ? value : "",
      });
      setInstructionsByLanguage((prev) => ({
        ...prev,
        [languageId]: updated.translationInstructions || "",
      }));
      setLastSavedMessage((prev) => ({
        ...prev,
        [languageId]: "Saved just now",
      }));
    } catch (error: any) {
      console.error("Failed to save instructions", error);
      alert(error.message || "Failed to save instructions");
    } finally {
      setSavingLanguageId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Language Instructions</h1>
              <p className="text-gray-600">
                Define custom guidance for the AI translator per language.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-4">
          {languages.map((language) => (
            <Card key={language.id} className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">{language.name}</h2>
                  <p className="text-sm text-gray-500 flex items-center gap-2">
                    <Badge variant="secondary">{language.code}</Badge>
                    <span>
                      Applied when translating from English to {language.name}
                    </span>
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleSave(language.id)}
                  disabled={savingLanguageId === language.id}
                >
                  {savingLanguageId === language.id ? "Saving..." : "Save"}
                </Button>
              </div>
              <Textarea
                value={instructionsByLanguage[language.id] || ""}
                onChange={(event) =>
                  setInstructionsByLanguage((prev) => ({
                    ...prev,
                    [language.id]: event.target.value,
                  }))
                }
                placeholder="Explain tone, glossary terms, markdown dos/don'ts..."
                rows={6}
              />
              <div className="text-xs text-gray-500 mt-2">
                {lastSavedMessage[language.id] ||
                  "These instructions are appended to the system prompt."}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
