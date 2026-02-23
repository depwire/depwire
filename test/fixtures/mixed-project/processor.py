# Python data processing
from typing import Dict, List

class DataProcessor:
    def __init__(self):
        self.cache: Dict[str, List] = {}
    
    def process(self, data: List[Dict]) -> List[Dict]:
        """Process and transform data"""
        return [self._transform(item) for item in data]
    
    def _transform(self, item: Dict) -> Dict:
        """Transform a single item"""
        return {
            'id': item.get('id'),
            'value': item.get('value', 0) * 2
        }
