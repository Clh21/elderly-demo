import PyPDF2
reader = PyPDF2.PdfReader('FW1-Proposal.pdf')
for i, page in enumerate(reader.pages):
    print(page.extract_text())
