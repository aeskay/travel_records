const FormData = require('form-data'); // Still need this for constructing the multipart body

exports.handler = async (event, context) => {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        if (!process.env.OPENAI_API_KEY) {
            console.error('Missing OPENAI_API_KEY');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server configuration error: Missing API Key' }),
            };
        }

        // Check content type. We expect a direct binary upload for simplicity or base64 JSON
        // To keep things robust without external parsers like busboy, we'll suggest the client sends 
        // a JSON body with base64 encoded audio, OR we can try to parse the raw body if it's multipart.
        // EASIEST: Client sends raw binary body with Content-Type: audio/webm

        const audioBuffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'binary');

        // OpenAI requires a filename for the file part.
        const formData = new FormData();
        formData.append('file', audioBuffer, {
            filename: 'audio.webm',
            contentType: 'audio/webm',
        });
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                ...formData.getHeaders(),
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI API Error:', errorText);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: 'Transcription failed', details: errorText }),
            };
        }

        const data = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify({ text: data.text }),
        };

    } catch (error) {
        console.error('Handler error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error', details: error.message }),
        };
    }
};
