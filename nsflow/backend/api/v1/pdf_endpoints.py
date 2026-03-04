# Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# END COPYRIGHT
"""
PDF processing endpoints for extracting text from uploaded PDF files.
Uses pypdf for reliable text extraction from PDF documents.
"""
import io
import logging
from typing import List

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pypdf import PdfReader

router = APIRouter(prefix="/api/v1")

# Constants
MIN_PDF_BYTES = 100  # Minimum file size for valid PDF
MAX_PDF_SIZE_MB = 50  # Maximum PDF size in megabytes
MAX_PDF_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024


def validate_pdf_file(file: UploadFile) -> None:
    """Validate that the uploaded file is a PDF.

    Args:
        file: The uploaded file to validate

    Raises:
        HTTPException: If file is not a valid PDF or content type is wrong
    """
    if not file.content_type or "pdf" not in file.content_type.lower():
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file.content_type}'. Please upload a PDF file."
        )

    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=400,
            detail="File must have a .pdf extension."
        )


def extract_text_from_pdf(pdf_bytes: bytes, filename: str) -> str:
    """Extract text from PDF bytes using pypdf.

    Args:
        pdf_bytes: The PDF file content as bytes
        filename: Name of the PDF file (for logging)

    Returns:
        Extracted text from all pages of the PDF

    Raises:
        HTTPException: If PDF cannot be read or parsed
    """
    try:
        pdf_stream = io.BytesIO(pdf_bytes)
        reader = PdfReader(pdf_stream)

        num_pages: int = len(reader.pages)
        logging.info("Processing PDF '%s' with %d pages", filename, num_pages)

        if num_pages == 0:
            raise HTTPException(
                status_code=400,
                detail=f"PDF file '{filename}' contains no pages."
            )

        text_parts: list[str] = []

        for page_num, page in enumerate(reader.pages, 1):
            try:
                page_text: str = page.extract_text()

                if page_text and page_text.strip():
                    text_parts.append(f"[Page {page_num}]\n{page_text}")
                else:
                    logging.warning("Page %d of '%s' contains no extractable text", page_num, filename)
                    text_parts.append(f"[Page {page_num}]\n[No extractable text on this page]")

            except Exception as e:
                logging.error("Error extracting text from page %d of '%s': %s", page_num, filename, e)
                text_parts.append(f"[Page {page_num}]\n[Error extracting text: {str(e)}]")

        full_text: str = "\n\n".join(text_parts)

        logging.info(
            "Successfully extracted %d characters from %d pages of '%s'",
            len(full_text),
            num_pages,
            filename
        )

        return full_text

    except HTTPException:
        raise
    except Exception as e:
        logging.error("Failed to parse PDF '%s': %s", filename, e)
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse PDF file '{filename}': {str(e)}"
        ) from e


@router.post("/process_pdfs")
async def process_pdfs(files: List[UploadFile] = File(...)):
    """
    Process uploaded PDF files and extract text from each.

    Accepts any number of PDF files. Files are processed in order and text is 
    extracted from each page.

    Args:
        files: List of PDF files to process

    Returns:
        JSON response containing:
        - success: Boolean indicating if processing succeeded
        - extracted_texts: Array of extracted text strings (one per PDF)
        - file_count: Number of PDFs successfully processed
        - files_processed: List of filenames processed

    Raises:
        HTTPException: If no PDFs provided, invalid file type, or processing fails

    Example curl command:
        curl -X POST http://127.0.0.1:8005/api/v1/process_pdfs \\
            -F "files=@document1.pdf" \\
            -F "files=@document2.pdf" \\
            -F "files=@document3.pdf"
    """
    try:
        if not files:
            raise HTTPException(
                status_code=400,
                detail="No PDF files provided. Please upload at least one PDF file."
            )

        logging.info("Received %d PDF file(s) for processing", len(files))

        extracted_texts: list[str] = []
        filenames_processed: list[str] = []

        for idx, pdf_file in enumerate(files):
            filename: str = pdf_file.filename or f"pdf_{idx}.pdf"

            try:
                # Validate file type
                validate_pdf_file(pdf_file)

                # Read PDF content
                pdf_bytes: bytes = await pdf_file.read()
                file_size: int = len(pdf_bytes)

                logging.info(
                    "Processing PDF %d/%d: '%s' (%d bytes)",
                    idx + 1,
                    len(files),
                    filename,
                    file_size
                )

                # Validate file size
                if file_size < MIN_PDF_BYTES:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"PDF file '{filename}' is too small ({file_size} bytes). "
                            "Please provide a valid PDF file."
                        )
                    )

                if file_size > MAX_PDF_BYTES:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"PDF file '{filename}' is too large ({file_size / (1024*1024):.1f} MB). "
                            f"Maximum size is {MAX_PDF_SIZE_MB} MB."
                        )
                    )

                # Extract text from PDF
                extracted_text: str = extract_text_from_pdf(pdf_bytes, filename)

                extracted_texts.append(extracted_text)
                filenames_processed.append(filename)

            except HTTPException:
                raise
            except Exception as e:
                logging.error("Error processing PDF '%s': %s", filename, e)
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to process PDF '{filename}': {str(e)}"
                ) from e

        response = {
            "success": True,
            "extracted_texts": extracted_texts,
            "file_count": len(extracted_texts),
            "files_processed": filenames_processed
        }

        logging.info("Successfully processed %d PDF file(s)", len(extracted_texts))

        return JSONResponse(content=response)

    except HTTPException:
        raise
    except Exception as e:
        logging.error("Error in process_pdfs endpoint: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"PDF processing failed: {str(e)}"
        ) from e
