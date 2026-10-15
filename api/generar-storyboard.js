
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      error: "Método no permitido. Usa POST."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "Falta configurar GEMINI_API_KEY en Vercel."
    });
  }

  try {
    const body = req.body || {};

    const prompt =
      typeof body.prompt === "string" ? body.prompt :
      typeof body.description === "string" ? body.description :
      "";

    if (!prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: "Primero pega el guion del episodio."
      });
    }

    const episode = body.episode || {};
    const characters = body.characters || [];
    const existingShots = body.shots || [];

    const instructions = `
Eres un director profesional de minidramas
verticales para redes sociales.

Crea un storyboard cinematográfico basado
en el guion proporcionado.

Devuelve únicamente un objeto JSON válido,
sin Markdown ni bloques de código, con esta forma:

{
  "title": "Título del episodio o escena",
  "shots": [
    {
      "number": 1,
      "title": "Nombre del plano",
      "description": "Qué sucede visualmente",
      "camera": "Tipo de plano y movimiento",
      "dialogue": "Diálogo o narración",
      "duration": 5,
      "visualPrompt": "Descripción visual detallada"
    }
  ]
}

Genera entre 4 y 8 planos consecutivos.
Cada plano debe corresponder al guion.
Mantén coherencia en personajes, vestuario,
lugares, iluminación y continuidad narrativa.
La duración debe ser un número de segundos.
Incluye diálogos relevantes cuando existan.
No inventes personajes innecesarios.
Asegúrate de que "shots" sea una lista
con al menos 4 elementos.
`;

    const input = `
${instructions}

GUION DEL EPISODIO:
${prompt}

DATOS DEL EPISODIO:
${JSON.stringify(episode)}

PERSONAJES:
${JSON.stringify(characters)}

PLANOS EXISTENTES (solo como referencia):
${JSON.stringify(existingShots)}
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: input }]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.5,
            maxOutputTokens: 8192
          }
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Error de Gemini:", {
        status: response.status,
        message: result.error?.message || "Error desconocido",
        statusText: result.error?.status || ""
      });

      return res.status(502).json({
        success: false,
        error: "Gemini no pudo generar el storyboard.",
        details:
          result.error?.message ||
          `El proveedor respondió con estado ${response.status}.`
      });
    }

    const generatedText =
      result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!generatedText) {
      console.error(
        "Gemini devolvió contenido vacío o bloqueado:",
        JSON.stringify({
          finishReason: result.candidates?.[0]?.finishReason,
          promptFeedback: result.promptFeedback
        })
      );

      return res.status(502).json({
        success: false,
        error: "Gemini no devolvió texto utilizable.",
        details:
          result.candidates?.[0]?.finishReason ||
          result.promptFeedback?.blockReason ||
          "La respuesta llegó vacía."
      });
    }

    let data;

    try {
      const cleanedText = generatedText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      data = JSON.parse(cleanedText);
    } catch (error) {
      console.error(
        "Gemini devolvió JSON no válido:",
        generatedText.slice(0, 1500)
      );

      return res.status(502).json({
        success: false,
        error: "Gemini devolvió una respuesta que no es JSON válido.",
        details: error.message
      });
    }

    // Admite distintas formas de organizar la respuesta.
    const storyboard =
      data.storyboard && typeof data.storyboard === "object"
        ? data.storyboard
        : data;

    const shots =
      storyboard.shots ||
      storyboard.planes ||
      storyboard.planos ||
      data.shots ||
      data.planes ||
      data.planos;

    if (!Array.isArray(shots) || shots.length === 0) {
      console.error(
        "La respuesta JSON no contiene planos:",
        JSON.stringify(data).slice(0, 2000)
      );

      return res.status(502).json({
        success: false,
        error: "La respuesta de Gemini no contiene planos.",
        details: "No se encontró una lista de planos válida."
      });
    }

    const normalizedShots = shots.map((shot, index) => ({
      number: Number(shot.number) || index + 1,
      title: shot.title || `Plano ${index + 1}`,
      description:
        shot.description ||
        shot.visualPrompt ||
        shot.visual ||
        "Plano basado en el guion.",
      camera: shot.camera || shot.cameraMovement || "Plano medio",
      dialogue: shot.dialogue || shot.audio || "",
      duration: Number(shot.duration) || 5,
      visualPrompt:
        shot.visualPrompt ||
        shot.description ||
        shot.visual ||
        ""
    }));

    const finalStoryboard = {
      title: storyboard.title || "Storyboard del episodio",
      shots: normalizedShots
    };

    // Se devuelven ambas formas para facilitar
    // la compatibilidad con distintas versiones del frontend.
    return res.status(200).json({
      success: true,
      storyboard: finalStoryboard,
      shots: normalizedShots
    });

  } catch (error) {
    console.error("Error interno del storyboard:", {
      message: error.message,
      name: error.name
    });

    return res.status(500).json({
      success: false,
      error: "Ocurrió un error interno al generar el storyboard.",
      details: error.message
    });
  }
}
