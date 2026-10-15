
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Falta configurar GEMINI_API_KEY en Vercel"
    });
  }

  try {
    const { nombre = "", sinopsis = "", generosActuales = [] } =
      req.body || {};

    if (!sinopsis.trim()) {
      return res.status(400).json({
        error: "Escribe una sinopsis para recomendar géneros"
      });
    }

    const prompt = `
Eres especialista en creación de minidramas y series.
Analiza el título y la sinopsis y recomienda entre 2 y 4 géneros
que encajen mejor con la historia.

Géneros permitidos:
Drama, Romance, Misterio, Fantasía, Suspenso, Acción,
Comedia, Venganza, Traición, Crimen, Thriller, Aventura,
Ciencia ficción, Terror, Histórico, Familiar, Juvenil,
Supernatural, Política.

Título: ${nombre}
Sinopsis: ${sinopsis}
Géneros seleccionados por el usuario: ${JSON.stringify(generosActuales)}

Responde únicamente con JSON válido, sin Markdown, con esta estructura:
{
  "generos": ["Romance", "Misterio"],
  "motivo": "Explicación breve de por qué encajan."
}
No inventes géneros fuera de la lista permitida.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", data);
      return res.status(502).json({
        error: "Gemini no pudo recomendar los géneros"
      });
    }

    const texto = data.candidates?.[0]?.content?.parts
      ?.map((parte) => parte.text || "")
      .join("");

    if (!texto) {
      return res.status(502).json({
        error: "Gemini no devolvió recomendaciones"
      });
    }

    const resultado = JSON.parse(texto);

    return res.status(200).json({
      generos: Array.isArray(resultado.generos)
        ? resultado.generos
        : [],
      motivo: resultado.motivo || ""
    });
  } catch (error) {
    console.error("Error recomendando géneros:", error);
    return res.status(500).json({
      error: "No fue posible recomendar los géneros"
    });
  }
}
  
