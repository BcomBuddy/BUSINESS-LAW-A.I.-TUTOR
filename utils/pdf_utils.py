import fitz  # PyMuPDF
from io import BytesIO

def extract_text_from_pdf(file_stream):
    """Extract text content from a PDF file stream using PyMuPDF."""
    try:
        # Reset stream and read bytes
        file_stream.seek(0)
        pdf_bytes = file_stream.read()
        pdf_stream = BytesIO(pdf_bytes)

        text = ""
        with fitz.open(stream=pdf_stream, filetype="pdf") as pdf:
            for page in pdf:
                page_text = page.get_text("text")
                if page_text:
                    text += page_text + "\n"
        return text.strip()
    except Exception as e:
        raise RuntimeError(f"PDF extraction failed: {str(e)}")
