
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Método no permitido. Usa POST."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Falta configurar GEMINI_API_KEY en Vercel."
    });
  }

  try {
    const body = req.body || {};

    const prompt =
      typeof body.prompt === "string" ? body.prompt :
      typeof body.description === "string" ? body.description :
      "";

    const episode = body.episode || {};
    const characters = body.characters || [];
    const existingShots = body.shots || [];

    const instructions = `
Eres un director profesional de minidramas
verticales para redes sociales.

Tu tarea es crear un storyboard cinematográfico
a partir de la información recibida.

Devuelve SOLAMENTE un JSON válido con esta estructura:
{
  "title": "Título de la escena",
  "shots": [
    {
      "number": 1,
      "title": "Nombre del plano",
      "description": "Qué sucede visualmente",
      "camera": "Tipo de plano y movimiento",
      "dialogue": "Diálogo o narración",
      "duration": 5,
      "visualPrompt": "Descripción visual detallada
para generar una imagen de esta toma"
    }
  ]
}

Crea entre 4 y 8 tomas consecutivas.
Mantén coherencia entre personajes, vestuario,
lugares, emociones y continuidad narrativa.
Las duraciones deben estar expresadas en segundos.
No inventes personajes ajenos a la historia
salvo que sean necesarios.
No incluyas Markdown ni bloques de código.
`;

    const input = `
INSTRUCCIONES:
${instructions}

DESCRIPCIÓN O IDEA:
${prompt || "Crear un storyboard para el episodio indicado."}

EPISODIO:
${JSON.stringify(episode)}

PERSONAJES:
${JSON.stringify(characters)}

TOMAS EXISTENTES:
${JSON.stringify(existingShots)}
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
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
            temperature: 0.7
          }
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Error de Gemini:", response.status, result);

      return res.status(502).json({
        error: "Gemini no pudo generar el storyboard.",
        details: result.error?.message || "Error del proveedor de IA."
      });
    }

    const generatedText =
      result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!generatedText) {
      return res.status(502).json({
        error: "Gemini devolvió una respuesta vacía."
      });
    }

    let storyboard;

    try {
      storyboard = JSON.parse(generatedText);
    } catch {
      console.error("Respuesta no válida de Gemini:", generatedText);

      return res.status(502).json({
        error: "La respuesta de Gemini no contiene JSON válido."
      });
    }

    if (!Array.isArray(storyboard.shots)) {
      return res.status(502).json({
        error: "La respuesta no contiene la lista de tomas esperada."
      });
    }

    return res.status(200).json({
      success: true,
      storyboard
    });

  } catch (error) {
    console.error("Error interno del storyboard:", error);

    return res.status(500).json({
      error: "Ocurrió un error interno al generar el storyboard."
    });
  }
      }
