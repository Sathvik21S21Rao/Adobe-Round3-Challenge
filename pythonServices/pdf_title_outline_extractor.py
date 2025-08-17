
import pymupdf4llm
import re
import json
import fitz
from typing import Dict, List, Optional
from pathlib import Path
import time
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
from final_nltk import *
from difflib import get_close_matches

class PDFTitleOutlineExtractor:
    def __init__(self):
        pass


    def extract_title_from_first_page(self, pdf_path: str) -> Optional[str]:
        """Extract title heuristically from the first page"""
        try:
            doc = fitz.open(pdf_path)
            if len(doc) == 0:
                return None

            first_page = doc[0]
            blocks = first_page.get_text("dict")["blocks"]
            page_width = first_page.rect.width

            # Look for the largest font size text in the first page
            largest_font_size = 0
            title_candidates = []

            for block in blocks:
                if "lines" in block:
                    for line in block["lines"]:
                        for span in line["spans"]:
                            font_size = span["size"]
                            text = span["text"].strip()
                            if(span["bbox"][0]>page_width*0.6):
                                continue

                            # Skip very short texts and common non-title texts
                            if (len(text) > 5 and 
                                not any(word in text.lower() for word in ('page', 'copyright', '©', 'author', 'date')) and
                                not re.match(r'^\d+$', text)):
                                # also check if majority of text has alnumeric characters
                                count_alnum = sum(c.isalnum() or c.isspace() for c in text)

                                if font_size > largest_font_size and count_alnum/len(text) > 0.7:
                                    largest_font_size = font_size
                                    title_candidates = [text]
                                elif font_size == largest_font_size:
                                    title_candidates.append(text)

            # Return the first reasonable title candidate
        
            for candidate in title_candidates:
                candidate = candidate.strip()
                if len(candidate.split()) <= 10:  # Reasonable title length
                    return candidate

            doc.close()
        except Exception as e:
            print(f"Error extracting title from first page: {e}")

        return None

    def determine_title(self, pdf_path: str, markdown_content: str) -> str:
        """Determine the best title for the PDF"""
        title=None
        for line in markdown_content.split('\n'):
            line = line.strip()
            line = line.replace('**', '').replace('*', '')
            
            
            if line.count('#') == 1 and re.sub(r'[^\w\s\.\,]', '', line).strip() and line.strip().startswith('#'):
                title = line[1:].strip()
                title = title.replace('**', '').replace('*', '')
                break
        if not title:
            title = self.extract_title_from_first_page(pdf_path)
            
        

        if not title:
            title = Path(pdf_path).stem.replace('_', ' ').replace('-', ' ').title()

        return title
    @staticmethod
    def is_bold(span):
        """Check if the font is bold by looking for 'Bold' in the font name."""
        return "Bold" in span.get("font", "")

    def extract_markdown_from_pdf(self, pdf_path):

        doc = fitz.open(pdf_path)
        markdown_pages = []

        for page_num, page in enumerate(doc, 1):
            blocks = page.get_text("dict")["blocks"]
            markdown_output = ""
            found_table = False

            # Collect average font size
            font_sizes = []
            for block in blocks:
                if "lines" in block:
                    for line in block["lines"]:
                        for span in line["spans"]:
                            font_sizes.append(span["size"])
            avg_font_size = sum(font_sizes) / len(font_sizes) if font_sizes else 12

            for block in blocks:
                if "lines" not in block:
                    continue

                line_positions = []
                for line in block["lines"]:
                    spans = line["spans"]
                    if not spans:
                        continue

                    line_text = " ".join(span["text"] for span in spans).strip()
                    if not line_text:
                        continue

                    # Detect bullet points
                    if line_text.startswith(("●", "•", "-")):
                        markdown_output += f"- {line_text[1:].strip()}\n"
                        continue

                    avg_font_span = sum(span["size"] for span in spans) / len(spans)

                    # Detect potential table patterns
                    # If the line has multiple spans with same y-coordinates and different x-coordinates → likely a row in a table
                    if len(spans) >= 2:
                        y_coords = [round(span["bbox"][1], 1) for span in spans]
                        if max(y_coords) - min(y_coords) < 2.0:
                            x_coords = [span["bbox"][0] for span in spans]
                            if max(x_coords) - min(x_coords) > 100:  # heuristics
                                found_table = True
                                markdown_output += "| " + " | ".join(span["text"].strip() for span in spans) + " |\n"
                                markdown_output += "| " + " | ".join("---" for _ in spans) + " |\n"
                                continue

                    # Detect headers
                    if (
                        avg_font_span > avg_font_size * 1.2
                        and all(
                            not word.isalpha()
                            or (word.isalpha() and (word[0].isupper() or word.lower() in ENGLISH_STOP_WORDS))
                            for word in line_text.split()
                        )
                        and not all(word.lower() in ENGLISH_STOP_WORDS for word in line_text.split())
                    ) and any(word.isalpha() for word in line_text.split()):
                        if avg_font_span > avg_font_size * 1.8:
                            markdown_output += f"# {line_text}\n"
                        elif avg_font_span > avg_font_size * 1.4:
                            markdown_output += f"## {line_text}\n"
                        else:
                            markdown_output += f"### {line_text}\n"
                    else:
                        markdown_output += f"{line_text}\n"

            if found_table:
                pass

            markdown_pages.append(markdown_output.strip())

        return markdown_pages


    def parse_markdown_headers(self, markdown_content: str,title:str,level_mapping:Dict[int, int]) -> List[Dict]:
        """Parse explicit markdown headers"""
        headers = []
        lines = markdown_content.split('\n')

        for i, line in enumerate(lines):
            line = line.strip()
            if title.lower().strip() in line.lower().replace('**', '').replace('*', '').replace('#','').strip():
                continue
            if line.startswith('#'):
                hash_count = line.count('#')
                month=[ 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December','Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                if any(m.lower() in line.lower() for m in month):
                    continue
                level = level_mapping.get(hash_count, 3)  # Default to level 3

                # remove special characters keep space
                
                cleaned_line = re.sub(r'[^\w\s\.\,]', '', line[hash_count:]).strip()
                text=cleaned_line
         

                if text:
                    headers.append({
                        'level': f'H{level}',
                        'text': text,
                        'line_number': i
                    })

        return headers

    def group_markdown_headers(self, markdown_content: str) -> List[Dict]:
        headers={}
        for line in markdown_content.split('\n'):
            line = line.strip()
            
            if line.startswith('#') :
                
                level = line.count('#')
                if level>0:
                    headers[level]=headers.get(level, 0) + 1
        return headers

    def detect_semantic_headers(self, markdown_content: str,title:str) -> List[Dict]:
        """Detect headers using semantic analysis"""
        headers = []
        lines = markdown_content.split('\n')

        for i, line in enumerate(lines):
            if(title.lower().strip() in line.lower().replace('**', '').replace('*', '').replace('#','').strip()):
                continue
            line = line.strip()
            if line.startswith('#') or line.count('|')>0 or line.count('---')>0  or line.count('...')>0:
                continue
            else:
                # if date in line, skip it
                
                month=[ 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December','Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                if any(m.lower() in line.lower() for m in month):
                    continue
                
                if any(word.lower() in line.lower() for word in ['page', 'copyright', '©', 'author', 'date']):
                    continue
                line = re.sub(r'^\s*(?:[A-Za-z]+|\d+(?:\.\d+)*)(?:[\.\)])?\s+', '', line)


                cleaned_line = re.sub(r'[^\w\s]', '', line).strip()
                cleaned_line_temp=""

                for c in cleaned_line:
                    if c.isalnum() or c.isspace():
                        cleaned_line_temp+=c
                cleaned_line=cleaned_line_temp.strip()
                if len(cleaned_line)>0  and len(cleaned_line.split())<=10 and cleaned_line[0].isupper() and not all(word.lower() in ENGLISH_STOP_WORDS for word in cleaned_line.split()) and any(word.isalpha() for word in cleaned_line.split()) or cleaned_line.endswith(':'):
                    for j in range(i+1, len(lines)):
                        
                        next_line = lines[j].strip()

                        if next_line.count('---')>0 :
                            
                            break
                        if next_line:
                            # Found a semantic header
                            level=3
                            line=line.strip('_').strip()

                            
                            headers.append({
                                'level': f'H{level}',
                                'text': re.sub(r'[^\w\s\.\,]', '', line).strip(),
                                'line_number': i
                            })
                            
                            break
        return headers

   

    def estimate_page_numbers(self, headers: List[Dict], line_to_page_map: List[int]) -> List[Dict]:

        """Estimate page numbers for headers"""
        for header in headers:
            line_num = header['line_number']
            if 0 <= line_num < len(line_to_page_map):
                header['page'] = line_to_page_map[line_num]
            else:
                header['page'] = 1  
        return headers


    def merge_and_sort_headers(self, markdown_headers: List[Dict], semantic_headers: List[Dict]) -> List[Dict]:
        """Merge markdown and semantic headers"""
        all_headers = []
        seen_texts = set()

        for i, header_list in enumerate([markdown_headers, semantic_headers]):
            for header in header_list:
                text_key = header['text'].lower().strip()
                if len(text_key) > 2 and text_key+str(header['line_number']) not in seen_texts:
                    all_headers.append(header)
                    seen_texts.add(text_key+str(header['line_number']))

        all_headers.sort(key=lambda x: x['line_number'])

        return all_headers

    def process_pdf(self, pdf_path: str, verbose: bool = True) -> Dict:
        """Main method to process PDF and extract title and outline"""
        start_time = time.time()

        try:
            # Step 1: Convert PDF to markdown
            if verbose:
                print("Converting PDF to markdown...")
            markdown_pages = pymupdf4llm.to_markdown(pdf_path, page_chunks=True)
            markdown_pages_alt= self.extract_markdown_from_pdf(pdf_path)
            for i,page in enumerate(markdown_pages):
                if page['text'] is None or page['text'].strip() == "":
                    markdown_pages[i]['text'] = markdown_pages_alt[i].strip()
                page['text'] = page['text'].strip()

            markdown_lines = []
            line_to_page_map = []

            for i, page_md in enumerate(markdown_pages):
                
                lines = page_md['text'].split('\n')
                markdown_lines.extend(lines)
                line_to_page_map.extend([i + 1] * len(lines))
            
            
            markdown_content = '\n'.join(markdown_lines)            

            # Step 2: Extract title
            if verbose:
                print("Extracting title...")
            title = self.determine_title(pdf_path, markdown_content)

            # Step 3: Extract headers
            if verbose:
                print("Extracting headers...")
            
            headers=self.group_markdown_headers(markdown_content)
            headers.pop(1, None)  # Remove H1 headers if present
            level_mapping=[j for j in enumerate(sorted(headers.keys()))] # only 3 headers are present so merge anything above 3 to 3
            level_mapping = [(level+1, count) for level, count in level_mapping ]
            level_mapping = [(1, count) if level == 1 else (2, count) if level == 2 else (3, count) for level, count in level_mapping]
            level_mapping={count: level for level, count in level_mapping}
           
            
        
             
            markdown_headers = self.parse_markdown_headers(markdown_content,title,level_mapping)
            semantic_headers = []
     
            semantic_headers = self.detect_semantic_headers(markdown_content,title)

            # Step 4: Merge and process headers
            all_headers = self.merge_and_sort_headers(markdown_headers, semantic_headers)
            # Step 5: Estimate page numbers
            headers_with_pages = self.estimate_page_numbers(all_headers, line_to_page_map)
            
            
            feats_df = generate_feature_rich_dataset(pdf_path)
            # Ensure text fields align exactly (or use a more robust fuzzy match if needed)
            # e.g. strip whitespace:
            feats_df["full_text_trim"] = (feats_df["full_text"].str.strip())

            # Step 6: Format output
            
            outline = []
            for header in headers_with_pages:
                text = header["text"].strip()
                pg   = header["page"]  # 1-based

                # Filter rows by page number
                page_feats = feats_df[feats_df["page_num"] == pg]

                # Use difflib to find closest match on full_text_trim
                candidates = page_feats["full_text_trim"].dropna().tolist()
                closest_matches = get_close_matches(text, candidates, n=1, cutoff=0.6)

                if closest_matches:
                    best_match_text = closest_matches[0]
                    match = page_feats[page_feats["full_text_trim"] == best_match_text]
                    feat_row = match.iloc[0].to_dict()
                    feat_row.pop("full_text_trim", None)
                else:
                    continue  # Skip if no close match found 

                outline.append({
                    "text": text,
                    "page": pg - 1,
                    "features": feat_row
                })

            return {
                "title": title,
                "outline": outline,
                "processing_time": round(time.time() - start_time, 2)
            }

        except Exception as e:
            if verbose:
                print(f"Error processing PDF: {e}")
            return {
                'title': Path(pdf_path).stem,
                'outline': [],
                'error': str(e),
                'processing_time': round(time.time() - start_time, 2)
            }


def extract_pdf_title_and_outline(pdf_path: str, output_json: bool = False, verbose: bool = True) -> Dict:
    """
    Simple wrapper function to extract title and outline from PDF

    Args:
        pdf_path (str): Path to the PDF file
        output_json (bool): If True, returns JSON string instead of dict
        verbose (bool): If True, prints progress messages

    Returns:
        Dict or str: Title and outline data
    """
    extractor = PDFTitleOutlineExtractor()
    result = extractor.process_pdf(pdf_path, verbose=verbose)

    if output_json:
        return json.dumps(result, indent=2)
    return result


def batch_process_pdfs(pdf_directory: str, output_dir:str) -> Dict:
    """
    Process multiple PDFs in a directory

    Args:
        pdf_directory (str): Directory containing PDF files
        output_file (str): Output JSON file to save results

    Returns:
        Dict: Results for all processed PDFs
    """
    pdf_dir = Path(pdf_directory)
    pdf_files = list(pdf_dir.glob("*.pdf"))

    if not pdf_files:
        return {"error": "No PDF files found in directory"}

    extractor = PDFTitleOutlineExtractor()

    for pdf_file in pdf_files:
        print(f"Processing: {pdf_file.name}")
        
        result = extractor.process_pdf(str(pdf_file), verbose=False)
        with open(f"{output_dir}/{pdf_file.name.replace('.pdf', '.json')}", 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

def process_single_pdf(pdf_path: str) -> Dict:
    """
    Process a single PDF file and save the result to a JSON file

    Args:
        pdf_path (str): Path to the PDF file
        output_dir (str): Directory to save the output JSON file

    Returns:
        Dict: Result of processing the PDF
    """
    extractor = PDFTitleOutlineExtractor()
    result = extractor.process_pdf(pdf_path, verbose=False)
    return result
