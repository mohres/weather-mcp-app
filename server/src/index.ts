import {McpServer} from  "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from "zod";

// Create MCP server instance
const server = new McpServer({
  name: 'Weather Data Fetcher',
  version:  '1.0.0'

});


// A helper function to simulate fetching weather data
async function getWeatherByCity(city: string) {
  if (city.toLowerCase() === 'aleppo') {
    return { temp: '21°C', forecast: 'Sunny with clear skies' };
  }
    if (city.toLowerCase() === 'istanbul') {
    return { temp: '18°C', forecast: 'Partly cloudy with mild breeze' };
  }
  return { temp: null, error: 'Weather data not available for this city' };
}


// Registering a tool on the MCP server
server.tool(
  // Tool name
   'getWeatherDataByCityName',
   // Tool description
  'Get weather data for Aleppo or Istanbul',
  //  Define the input schema using Zod
  {
    city: z.string().describe('Name of the city to get weather for')
  },
// Define the async function that will run when the tool is called
  async ({city}) => {
    const weatherData = await getWeatherByCity(city);
      return{
      content: [
        {
          type: 'text',
          text: JSON.stringify(weatherData)
        }
      ]
    };
  }
);


// Registering a static resource on the MCP server
server.resource(
  // Resource name
  'cities',
  // URI: A unique identifier for this resource
  'weather://cities',
  // Resource metadata
  {
    description: 'List of supported cities',
    mimeType: 'text/plain'
  },
  // Data Function: An async function that returns the actual content of the resource
  async () => {
    return {
      contents: [{
        uri: 'weather://cities',
        text: `Supported Cities:
- Aleppo (Syria)
- Istanbul (Turkey)`,
        mimeType: 'text/plain'
      }]
    };
  }
);


async function init() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('>️  Weather MCP Server Started!');
  console.error('>️  Tool: getWeatherDataByCityName');
  console.error('>  Resource: weather://cities');
  console.error('>️  Supported Cities: Aleppo, Istanbul');
  console.error('>  Server ready!');

}

init().catch(console.error);
