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

        // Parse JSON body
        let body;
        try {
            body = JSON.parse(event.body);
        } catch (e) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid JSON body' }),
            };
        }

        if (!body.audio) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing audio data' }),
            };
        }

        const audioBuffer = Buffer.from(body.audio, 'base64');

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
