
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
    const guion = String(body.guion || body.prompt || "").trim();
    const titulo = String(body.titulo || "Minidrama");
    const episodio = body.episodio || 1;
    const enfoque = String(body.enfoque || "Cinematográfico");

    if (!guion) {
      return res.status(400).json({
        error: "Primero pega el guion del episodio."
      });
    }

    const prompt = `
Eres director de cine y especialista en minidramas
verticales para redes sociales.

Serie: ${titulo}
Episodio: ${episodio}
Enfoque visual: ${enfoque}

GUION DEL EPISODIO:
${guion}

Crea entre 4 y 8 planos consecutivos basados en el guion.
Respeta los personajes, sus nombres, el vestuario,
los lugares y la continuidad de la historia.
No inventes escenas que contradigan el guion.

Devuelve exclusivamente JSON válido con esta estructura:
{
  "planos": [
    {
      "tipo": "Nombre del plano",
      "duracion": 5,
      "visual": "Descripción visual concreta de la escena",
      "camera": "Encuadre y movimiento de cámara",
      "sonido": "Diálogo, música y sonidos ambientales"
    }
  ]
}

La duración debe ser un número de segundos.
Todos los campos deben contener texto útil en español.
No incluyas Markdown ni bloques de código.
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
              parts: [{ text: prompt }]
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
      console.error(
        "Error de Gemini:",
        response.status,
        result
      );

      return res.status(502).json({
        error: "Gemini no pudo generar el storyboard.",
        details: result.error?.message || "Error del proveedor de IA."
      });
    }

    const texto = (result.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || "")
      .join("")
      .trim();

    if (!texto) {
      return res.status(502).json({
        error: "Gemini devolvió una respuesta vacía."
      });
    }

    let datos;

    try {
      datos = JSON.parse(texto);
    } catch {
      console.error("JSON inválido de Gemini:", texto);

      return res.status(502).json({
        error: "Gemini devolvió un JSON inválido."
      });
    }

    if (!Array.isArray(datos.planos) || datos.planos.length === 0) {
      return res.status(502).json({
        error: "Gemini no devolvió la lista de planos esperada."
      });
    }

    const planos = datos.planos.map((p, i) => ({
      id: `gemini-${Date.now()}-${i}`,
      tipo: String(p.tipo || `Plano ${i + 1}`),
      duracion: Math.max(
        1,
        Math.min(120, Number(p.duracion) || 5)
      ),
      visual: String(p.visual || ""),
      camera: String(p.camera || ""),
      sonido: String(p.sonido || "")
    }));

    return res.status(200).json({
      success: true,
      planos
    });

  } catch (error) {
    console.error("Error interno del storyboard:", error);

    return res.status(500).json({
      error: "Ocurrió un error interno al generar el storyboard."
    });
  }
}
