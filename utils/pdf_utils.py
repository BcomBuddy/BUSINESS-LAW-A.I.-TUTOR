import fitz  # PyMuPDF
from io import BytesIO

def extract_text_from_pdf(file_stream):
    """Extract text content from a PDF file stream using PyMuPDF with multiple fallback methods."""
    try:
        # Reset stream and read bytes
        file_stream.seek(0)
        pdf_bytes = file_stream.read()
        pdf_stream = BytesIO(pdf_bytes)

        text = ""
        
        # Method 1: Standard text extraction
        try:
            with fitz.open(stream=pdf_stream, filetype="pdf") as pdf:
                for page in pdf:
                    page_text = page.get_text("text")
                    if page_text:
                        text += page_text + "\n"
        except Exception as e:
            print(f"Standard extraction failed: {e}")
        
        # Method 2: If no text found, try different extraction methods
        if not text.strip():
            try:
                pdf_stream.seek(0)
                with fitz.open(stream=pdf_stream, filetype="pdf") as pdf:
                    for page in pdf:
                        # Try different text extraction methods
                        for method in ["text", "blocks", "words"]:
                            try:
                                if method == "text":
                                    page_text = page.get_text("text")
                                elif method == "blocks":
                                    blocks = page.get_text("blocks")
                                    page_text = "\n".join([block[4] for block in blocks if len(block) > 4])
                                elif method == "words":
                                    words = page.get_text("words")
                                    page_text = " ".join([word[4] for word in words])
                                
                                if page_text and len(page_text.strip()) > 10:
                                    text += page_text + "\n"
                                    break
                            except:
                                continue
            except Exception as e:
                print(f"Alternative extraction failed: {e}")
        
        return text.strip()
    except Exception as e:
        raise RuntimeError(f"PDF extraction failed: {str(e)}")
